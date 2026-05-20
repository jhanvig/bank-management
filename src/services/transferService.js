// transferService.js
// Internal transfers: by account number within JG Bank
// Interbank transfers: routed through BMS hub

import axios from 'axios';
import {
  doc, collection, runTransaction,
  getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';
import { privateDb } from '../firebase';
import { initiateInterbankTransfer} from './hubService';

const projectId = process.env.REACT_APP_FIRESTORE_PROJECT_ID;
const apiKey    = process.env.REACT_APP_FIRESTORE_API_KEY;
const API_URL   = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toFirestoreValue = (value) => {
  if (typeof value === 'string')  return { stringValue: value };
  if (typeof value === 'number')  return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value instanceof Date)      return { timestampValue: value.toISOString() };
  return { stringValue: String(value) };
};

const fromFirestoreValue = (fields) => {
  const result = {};
  Object.keys(fields).forEach((key) => {
    const f = fields[key];
    if      ('stringValue'    in f) result[key] = f.stringValue;
    else if ('integerValue'   in f) result[key] = parseInt(f.integerValue);
    else if ('doubleValue'    in f) result[key] = f.doubleValue;
    else if ('booleanValue'   in f) result[key] = f.booleanValue;
    else if ('timestampValue' in f) result[key] = f.timestampValue;
  });
  return result;
};

// ─── Verify account exists before transfer ────────────────────────────────────

export const verifyAccount = async ({ accountNumber, bankId = 'JGB' }) => {
  try {
    if (bankId === 'JGB') {
      const q    = query(collection(privateDb, 'accounts'), where('accountNumber', '==', accountNumber));
      const snap = await getDocs(q);
      if (snap.empty) {
        return { exists: false, error: `No JGBank account found with number ${accountNumber}.` };
      }
      const data = snap.docs[0].data();
      return { exists: true, accountName: data.customerName || data.customerId || '' };
    } else {
      return { exists: true, accountName: '' };
    }
  } catch (error) {
    return { exists: false, error: error.message };
  }
};

// ─── Internal transfer (same bank, by account number) ────────────────────────

export const transferMoney = async ({
  fromEmail,
  toAccountNumber,
  amount,
  note = '',
}) => {
  try {
    const amountPaise = Math.round(amount * 100);

    const senderQ    = query(collection(privateDb, 'accounts'), where('customerId', '==', fromEmail));
    const senderSnap = await getDocs(senderQ);

    if (senderSnap.empty) {
      return { success: false, error: 'Your account was not found.' };
    }

    const senderDoc = senderSnap.docs[0];
    const sender    = { id: senderDoc.id, ...senderDoc.data() };

    if (amountPaise > sender.balance) {
      return { success: false, error: 'Insufficient balance.' };
    }

    if (amountPaise > (sender.transferLimitPaise || 1000000)) {
      return {
        success: false,
        error: `Amount exceeds your transfer limit of ₹${((sender.transferLimitPaise || 1000000) / 100).toLocaleString('en-IN')}.`,
      };
    }

    const recipientQ    = query(collection(privateDb, 'accounts'), where('accountNumber', '==', toAccountNumber));
    const recipientSnap = await getDocs(recipientQ);

    if (recipientSnap.empty) {
      return { success: false, error: `No account found with number ${toAccountNumber}.` };
    }

    const recipientDoc = recipientSnap.docs[0];
    const recipient    = { id: recipientDoc.id, ...recipientDoc.data() };

    if (recipient.customerId === fromEmail) {
      return { success: false, error: 'You cannot transfer to your own account.' };
    }

    const senderNewBalance   = sender.balance - amountPaise;
    const receiverNewBalance = recipient.balance + amountPaise;

    await runTransaction(privateDb, async (txn) => {
      const sRef = doc(privateDb, 'accounts', sender.id);
      const rRef = doc(privateDb, 'accounts', recipient.id);
      txn.update(sRef, { balance: senderNewBalance,   updatedAt: serverTimestamp() });
      txn.update(rRef, { balance: receiverNewBalance, updatedAt: serverTimestamp() });
    });

    await axios.patch(
      `${API_URL}/customers/${fromEmail}?updateMask.fieldPaths=accountBalance&key=${apiKey}`,
      { fields: { accountBalance: toFirestoreValue(senderNewBalance / 100) } }
    );

    await axios.patch(
      `${API_URL}/customers/${recipient.customerId}?updateMask.fieldPaths=accountBalance&key=${apiKey}`,
      { fields: { accountBalance: toFirestoreValue(receiverNewBalance / 100) } }
    );

    await axios.post(`${API_URL}/transactions?key=${apiKey}`, {
      fields: {
        fromEmail:         toFirestoreValue(fromEmail),
        toEmail:           toFirestoreValue(recipient.customerId),
        fromAccountNumber: toFirestoreValue(sender.accountNumber),
        toAccountNumber:   toFirestoreValue(toAccountNumber),
        amount:            toFirestoreValue(amount),
        amountPaise:       toFirestoreValue(amountPaise),
        note:              toFirestoreValue(note),
        type:              toFirestoreValue('INTERNAL'),
        status:            toFirestoreValue('SUCCESS'),
        createdAt:         toFirestoreValue(new Date()),
      },
    });

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Interbank transfer (via hub) ─────────────────────────────────────────────

export const interbankTransfer = async ({
  fromEmail,
  toAccountNumber,
  toBankId,
  amount,
  mode = 'imps',
  note = '',
}) => {
  try {
    const amountPaise = Math.round(amount * 100);

    const senderQ    = query(collection(privateDb, 'accounts'), where('customerId', '==', fromEmail));
    const senderSnap = await getDocs(senderQ);
    if (senderSnap.empty) return { success: false, error: 'Your account was not found.' };

    const senderDoc        = senderSnap.docs[0];
    const fromAccountDocId = senderDoc.id;
    const senderData       = senderDoc.data();

    const transferId = await initiateInterbankTransfer({
      fromAccountDocId,
      toAccountNumber,
      toBankId,
      amountPaise,
      mode,
      note,
    });

    // Record transaction locally and capture the document ID
    const txResponse = await axios.post(`${API_URL}/transactions?key=${apiKey}`, {
      fields: {
        fromEmail:         toFirestoreValue(fromEmail),
        toEmail:           toFirestoreValue(''),
        fromAccountNumber: toFirestoreValue(senderData.accountNumber || ''),
        toAccountNumber:   toFirestoreValue(toAccountNumber),
        amount:            toFirestoreValue(amount),
        amountPaise:       toFirestoreValue(amountPaise),
        note:              toFirestoreValue(note),
        type:              toFirestoreValue('INTERBANK'),
        status:            toFirestoreValue('PENDING'),
        toBankId:          toFirestoreValue(toBankId),
        transferId:        toFirestoreValue(transferId),
        createdAt:         toFirestoreValue(new Date()),
      },
    });

    const localTxId = txResponse.data.name.split('/').pop();

    return { success: true, transferId, localTxId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Update transfer limit (Admin, stored in paise) ──────────────────────────

export const updateTransferLimit = async (customerEmail, limitRupees) => {
  try {
    const limitPaise = Math.round(limitRupees * 100);

    const q    = query(collection(privateDb, 'accounts'), where('customerId', '==', customerEmail));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(privateDb, 'accounts', snap.docs[0].id), {
        transferLimitPaise: limitPaise,
        updatedAt: serverTimestamp(),
      });
    }
    const mask = 'updateMask.fieldPaths=transferLimit';
    await axios.patch(
      `${API_URL}/customers/${customerEmail}?${mask}&key=${apiKey}`,
      { fields: { transferLimit: toFirestoreValue(limitRupees) } }
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─── Get transactions for a customer (combined: sent + received) ──────────────

export const getTransactions = async (email) => {
  try {
    const accQ      = query(collection(privateDb, 'accounts'), where('customerId', '==', email));
    const accSnap   = await getDocs(accQ);
    const accountNumber = accSnap.empty ? null : accSnap.docs[0].data().accountNumber;

    const queries = [
      axios.post(`${API_URL}:runQuery?key=${apiKey}`, {
        structuredQuery: {
          from: [{ collectionId: 'transactions' }],
          where: { fieldFilter: { field: { fieldPath: 'fromEmail' }, op: 'EQUAL', value: { stringValue: email } } },
        },
      }),
      axios.post(`${API_URL}:runQuery?key=${apiKey}`, {
        structuredQuery: {
          from: [{ collectionId: 'transactions' }],
          where: { fieldFilter: { field: { fieldPath: 'toEmail' }, op: 'EQUAL', value: { stringValue: email } } },
        },
      }),
    ];

    if (accountNumber) {
      queries.push(
        axios.post(`${API_URL}:runQuery?key=${apiKey}`, {
          structuredQuery: {
            from: [{ collectionId: 'transactions' }],
            where: { fieldFilter: { field: { fieldPath: 'fromAccountNumber' }, op: 'EQUAL', value: { stringValue: accountNumber } } },
          },
        }),
        axios.post(`${API_URL}:runQuery?key=${apiKey}`, {
          structuredQuery: {
            from: [{ collectionId: 'transactions' }],
            where: { fieldFilter: { field: { fieldPath: 'toAccountNumber' }, op: 'EQUAL', value: { stringValue: accountNumber } } },
          },
        })
      );
    }

    const responses = await Promise.all(queries);

    const parse = (resp) =>
      resp.data
        .filter(item => item.document)
        .map(item => ({
          id: item.document.name.split('/').pop(),
          ...fromFirestoreValue(item.document.fields),
        }));

    const seen = new Set();
    const txns = responses
      .flatMap(parse)
      .filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return { success: true, transactions: txns };
  } catch (error) {
    return { success: false, error: error.message };
  }
};