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

test('Demo payments do not turn a seller with pending requirements into an approved seller', async () => {
  const {stripeConnectionState} = await state;
  const view = stripeConnectionState({connected:true,demoMode:true,testMode:true,requirementsDue:['individual.proof_of_liveness'],chargesEnabled:false,payoutsEnabled:false});
  assert.equal(view.kind,'needs_information');assert.equal(view.ready,false);assert.equal(view.canResume,true);
  const approved = stripeConnectionState({connected:true,demoMode:true,testMode:true,chargesEnabled:true,payoutsEnabled:true});
  assert.equal(approved.kind,'ready');assert.match(approved.description,/conta de teste da plataforma/);
});

test('An inaccessible stored account cannot be shown as approved or resumed as a valid connection', async () => {
  const {stripeConnectionState} = await state;
  const view=stripeConnectionState({connected:true,disabledReason:'account_access_denied',chargesEnabled:true,payoutsEnabled:true,testMode:true,canRestartTestConnection:true});
  assert.equal(view.kind,'access_denied');assert.equal(view.connected,true);
  assert.equal(view.ready,false);assert.equal(view.canResume,false);assert.equal(view.label,'Sem acesso');
});

test('Seller requirements from both account versions have readable labels and preserve unknown requirements', async () => {
  const {stripeRequirementLabel} = await state;
  for (const value of ['individual.dob.day','representative.date_of_birth.month','identity.individual.date_of_birth.year']) assert.equal(stripeRequirementLabel(value),'Data de nascimento');
  assert.equal(stripeRequirementLabel('business_profile.support_phone'),'Telefone de suporte');
  assert.equal(stripeRequirementLabel('identity.individual.id_numbers.br_cpf'),'Número de identificação (CPF)');
  assert.equal(stripeRequirementLabel('individual.proof_of_liveness'),'Verificação de identidade e prova de vida');
  assert.equal(stripeRequirementLabel('tos_acceptance.date'),'Aceite dos termos na Stripe');
  assert.equal(stripeRequirementLabel('Nova informação exigida pela Stripe'),'Nova informação exigida pela Stripe');
});
