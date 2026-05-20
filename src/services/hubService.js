// hubService.js — BMS Interbank Network integration
// Handles: hub sign-in, bank registration, interbank transfers, incoming listener

import {
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  doc, collection, setDoc, getDoc, getDocs,
  updateDoc, onSnapshot, query, where,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';

import { hubDb, hubAuth }       from '../firebase/firebaseHub';
import { privateDb } from '../firebase';

const BANK_ID   = process.env.REACT_APP_BANK_ID   || 'jgb';
const BANK_NAME = process.env.REACT_APP_BANK_NAME  || 'JG Bank';
const IFSC_CODE = process.env.REACT_APP_IFSC_CODE  || 'JGB00001';

const HUB_EMAIL    = process.env.REACT_APP_HUB_BANK_EMAIL;
const HUB_PASSWORD = process.env.REACT_APP_HUB_BANK_PASSWORD;

// ─── Hub sign-in ──────────────────────────────────────────────────────────────
// Call this immediately after your own login succeeds.

export const signInToHub = async () => {
  try {
    await signInWithEmailAndPassword(hubAuth, HUB_EMAIL, HUB_PASSWORD);
    console.log('[HUB AUTH] Signed in as', BANK_ID);
    return { success: true };
  } catch (err) {
    console.warn('[HUB AUTH] Failed:', err.message);
    return { success: false, error: err.message };
  }
};

// ─── Register this bank on the hub (run once, or sync button) ─────────────────

export const syncBankToHub = async () => {
  try {
    await setDoc(doc(hubDb, 'banks', BANK_ID), {
      bankId:     BANK_ID,
      bankName:   BANK_NAME,
      ifscPrefix: IFSC_CODE.slice(0, 4),
      isActive:   true,
      updatedAt:  serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ─── Get all banks from hub (for dropdown) ────────────────────────────────────

export const getHubBanks = async () => {
  try {
    const snapshot = await getDocs(collection(hubDb, 'banks'));

    const banks = snapshot.docs.map(doc => ({
      id: doc.id,
      bankId: doc.data().bankId,
      bankName: doc.data().bankName,
      ifscPrefix: doc.data().ifscPrefix,
      isActive: doc.data().isActive,
    }));

    return {
      success: true,
      banks,
    };
  } catch (error) {
    console.error('Error fetching hub banks:', error);

    return {
      success: false,
      error: error.message,
    };
  }
};
// ─── Register an account on the hub (masked only) ────────────────────────────
// Call this whenever a new customer account is created/approved.

export const registerAccountOnHub = async (accountDocId, accountNumber) => {
  try {
    const masked = '••••' + String(accountNumber).slice(-4);
    await setDoc(doc(hubDb, 'public_accounts', accountDocId), {
      accountId:           accountDocId,
      bankId:              BANK_ID,
      maskedAccountNumber: masked,
      ifscCode:            IFSC_CODE,
      isActive:            true,
      registeredAt:        serverTimestamp(),
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// ─── Send interbank transfer ──────────────────────────────────────────────────
// Two-phase: deduct locally first, then write to hub.
// amountPaise: integer — 1 rupee = 100 paise

export const initiateInterbankTransfer = async ({
  fromAccountDocId,   // Firestore doc ID of sender's account in YOUR private DB
  toAccountNumber,    // account number string the sender typed
  toBankId,
  amountPaise,
  mode = 'imps',
  note = '',
}) => {
  // Generate the transfer ID from the private DB first
  const transferRef = doc(collection(privateDb, 'transactions'));
  const transferId  = transferRef.id;

  const fromRef = doc(privateDb, 'accounts', fromAccountDocId);

  // ── Phase 1: atomic deduction in private DB ──────────────────────────────
  await runTransaction(privateDb, async (txn) => {
    const fromSnap = await txn.get(fromRef);
    if (!fromSnap.exists()) throw new Error('Account not found.');

    const data = fromSnap.data();
    if (data.balance < amountPaise) throw new Error('Insufficient balance.');
    if (amountPaise > (data.transferLimitPaise || 1000000))
      throw new Error(`Amount exceeds your transfer limit.`);

    txn.update(fromRef, {
      balance:   data.balance - amountPaise,
      updatedAt: serverTimestamp(),
    });

    txn.set(transferRef, {
      transactionId: transferId,
      direction:     'debit',
      fromAccountId: fromAccountDocId,
      toAccountId:   toAccountNumber,
      fromBankId:    BANK_ID,
      toBankId,
      amount:        amountPaise,
      currency:      'INR',
      status:        'pending',
      mode,
      note,
      createdAt:     serverTimestamp(),
    });
  });

  // ── Phase 2: write to shared hub ─────────────────────────────────────────
  try {
    await setDoc(doc(hubDb, 'interbank_transfers', transferId), {
      transferId,
      fromBankId:    BANK_ID,
      toBankId,
      fromAccountId: fromAccountDocId,
      toAccountId:   toAccountNumber, // account NUMBER as entered by sender
      amount:        amountPaise,
      currency:      'INR',
      mode,
      status:        'pending',
      createdAt:     serverTimestamp(),
      completedAt:   null,
      failureReason: null,
    });
  } catch (hubErr) {
    console.error('[HUB WRITE] Failed:', hubErr.message);
    await updateDoc(transferRef, {
      status:        'failed',
      failureReason: 'Hub write failed: ' + hubErr.message,
    });
    throw new Error('Transfer submitted locally but hub sync failed. Contact support.');
  }

  return transferId;
};

// ─── Incoming transfer listener ───────────────────────────────────────────────
// Start this after login. Returns unsubscribe fn — call on logout.

export const startIncomingListener = (onSuccess, onError) => {
  console.log('[LISTENER] Starting for bankId:', BANK_ID);

  // ONE where clause only — avoids composite index
  const q = query(
    collection(hubDb, 'interbank_transfers'),
    where('toBankId', '==', BANK_ID),
  );

  return onSnapshot(q, async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added' && change.type !== 'modified') continue;

      const transfer = { id: change.doc.id, ...change.doc.data() };
      if (transfer.status !== 'pending') continue; // filter in JS — no composite index

      console.log('[LISTENER] Processing:', transfer.transferId);
      await _processIncoming(transfer).catch(err => {
        console.error('[LISTENER] Failed:', err.message);
        onError?.(transfer, err);
      });
    }
  }, err => {
    console.error('[LISTENER] Error:', err.code, err.message);
  });
};

const _processIncoming = async (transfer) => {
  const {
    transferId,
    fromBankId,
    fromAccountId,
    toAccountId,
    amount,
  } = transfer;

  const hubRef = doc(
    hubDb,
    'interbank_transfers',
    transferId
  );

  const localRef = doc(
    privateDb,
    'transactions',
    transferId
  );

  //
  // Find recipient account using account number
  //

  const q = query(
    collection(privateDb, 'accounts'),
    where('accountNumber', '==', toAccountId),
  );

  const snap = await getDocs(q);

  //
  // Recipient not found
  //

  if (snap.empty) {
    await updateDoc(hubRef, {
      status: 'failed',
      failureReason: `Account ${toAccountId} not found in ${BANK_ID}`,
      completedAt: serverTimestamp(),
    });

    return;
  }

  const recipientDoc = snap.docs[0];

  const recipient = {
    id: recipientDoc.id,
    ...recipientDoc.data(),
  };

  const toRef = doc(
    privateDb,
    'accounts',
    recipient.id
  );

  try {

    let receiverNewBalance = 0;

    //
    // Atomic incoming credit
    //

    await runTransaction(privateDb, async (txn) => {

      const toSnap = await txn.get(toRef);

      const localSnap = await txn.get(localRef);

      //
      // Prevent duplicate processing
      //

      if (localSnap.exists()) {
        throw new Error('DUPLICATE');
      }

      if (!toSnap.exists()) {
        throw new Error('Account vanished.');
      }

      //
      // Calculate new balance
      // amount is already in paise
      //

      receiverNewBalance =
        toSnap.data().balance + amount;

      //
      // Credit recipient account
      //

      txn.update(toRef, {
        balance: receiverNewBalance,
        updatedAt: serverTimestamp(),
      });

      //
      // Create local transaction record
      //

      txn.set(localRef, {
        transactionId: transferId,

        direction: 'credit',

        type: 'INTERBANK',

        fromBankId,
        toBankId: BANK_ID,

        fromAccountNumber: fromAccountId,
        toAccountNumber: toAccountId,

        fromEmail: `${fromBankId.toLowerCase()}@external.bank`,
        toEmail: recipient.customerId,

        amount: amount / 100,
        amountPaise: amount,

        currency: 'INR',

        status: 'SUCCESS',

        mode: transfer.mode || 'imps',

        note: transfer.note || '',

        createdAt: new Date().toISOString(),

        completedAt: new Date().toISOString(),
      });
    });

    //
    // Sync customer display balance
    // customers collection stores RUPEES
    //

    await updateDoc(
      doc(
        privateDb,
        'customers',
        recipient.customerId
      ),
      {
        accountBalance: receiverNewBalance / 100,
      }
    );

    //
    // Mark hub transfer completed
    //

    await updateDoc(hubRef, {
      status: 'SUCCESS',
      completedAt: serverTimestamp(),
    });

    console.log(
      '[LISTENER] Credited:',
      recipient.customerId,
      '+',
      amount / 100
    );

  } catch (err) {

    //
    // Ignore duplicate processing
    //

    if (err.message === 'DUPLICATE') {
      return;
    }

    console.error(
      '[LISTENER] Incoming transfer failed:',
      err.message
    );

    //
    // Mark hub transfer failed
    //

    await updateDoc(hubRef, {
      status: 'failed',
      failureReason: err.message,
      completedAt: serverTimestamp(),
    });
  }
};

// ─── Outgoing status listener ─────────────────────────────────────────────────
// Watches for destination bank updating status on YOUR transfers.

export const startStatusListener = (onStatusChange) => {
  const q = query(
    collection(hubDb, 'interbank_transfers'),
    where('fromBankId', '==', BANK_ID),
  );

  return onSnapshot(q, async (snapshot) => {
    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added' && change.type !== 'modified') continue;

      const transfer = { id: change.doc.id, ...change.doc.data() };
      if (transfer.status === 'pending') continue;

      const localRef  = doc(privateDb, 'transactions', transfer.transferId ?? transfer.id);
      const localSnap = await getDoc(localRef);

      if (localSnap.exists() && localSnap.data().direction === 'debit') {
        await updateDoc(localRef, {
          status:        transfer.status,
          completedAt:   serverTimestamp(),
          failureReason: transfer.failureReason ?? null,
        });
        onStatusChange?.(transfer);
      }
    }
  });
};
