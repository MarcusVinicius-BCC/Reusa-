const {test} = require('node:test');
const assert = require('node:assert/strict');
const state = import('../src/services/stripe-connection-state.mjs');

test('Completed Stripe onboarding stays connected while payment permissions are pending', async () => {
  const {stripeConnectionState} = await state;
  for (const chargesEnabled of [false, true]) {
    const view = stripeConnectionState({connected:true, detailsSubmitted:true, chargesEnabled, payoutsEnabled:false, testMode:true});
    assert.equal(view.kind, 'awaiting_activation');
    assert.equal(view.connected, true);
    assert.equal(view.ready, false);
    assert.equal(view.canResume, false);
    assert.equal(view.title, 'Conta Stripe de teste conectada');
  }
});

test('Stripe review does not send the seller back through completed onboarding', async () => {
  const {stripeConnectionState} = await state;
  const review = stripeConnectionState({connected:true, pendingVerification:true, requirementsDue:[]});
  assert.equal(review.kind, 'verifying');
  assert.equal(review.canResume, false);
  const missingData = stripeConnectionState({connected:true, pendingVerification:true, requirementsDue:['Documento de identidade']});
  assert.equal(missingData.kind, 'needs_information');
  assert.equal(missingData.canResume, true);
});

test('Only a connected seller with both Stripe permissions is ready to sell', async () => {
  const {stripeConnectionState} = await state;
  for (const connected of [false, true]) {
    for (const chargesEnabled of [false, true]) {
      for (const payoutsEnabled of [false, true]) {
        const view = stripeConnectionState({connected, chargesEnabled, payoutsEnabled});
        assert.equal(view.ready, connected && chargesEnabled && payoutsEnabled);
      }
    }
  }
  for (const disabledReason of ['account_closed', 'platform_access_revoked', 'unsupported_account_configuration']) {
    const view = stripeConnectionState({connected:true, disabledReason});
    assert.equal(view.kind, 'restricted');
    assert.equal(view.ready, false);
    assert.equal(view.canResume, false);
  }
});

test('An unknown connection is queried before offering a new seller registration', async () => {
  const {stripeConnectionState} = await state;
  assert.equal(stripeConnectionState(null).kind, 'checking');
  assert.equal(stripeConnectionState(null).canResume, false);
  assert.equal(stripeConnectionState(null, {error:'temporarily unavailable'}).kind, 'unavailable');
  assert.equal(stripeConnectionState({connected:false}).canResume, true);
  assert.equal(stripeConnectionState({connected:true, detailsSubmitted:false}).canResume, true);
});
