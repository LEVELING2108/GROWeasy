const test = require('node:test');
const assert = require('assert');

process.env.NODE_ENV = 'test';

const { isLeadMatch, checkIsDuplicate } = require('./server.js');

test('isLeadMatch - matches leads with identical emails', (t) => {
  const lead = { email: 'john.doe@example.com', mobile_without_country_code: '9876543210' };
  assert.strictEqual(isLeadMatch(lead, 'john.doe@example.com', ''), true);
  assert.strictEqual(isLeadMatch(lead, 'JOHN.DOE@EXAMPLE.COM', ''), true);
});

test('isLeadMatch - matches leads with identical mobile numbers', (t) => {
  const lead = { email: 'john.doe@example.com', mobile_without_country_code: '9876543210' };
  assert.strictEqual(isLeadMatch(lead, '', '9876543210'), true);
  assert.strictEqual(isLeadMatch(lead, '', ' 9876543210 '), true);
});

test('isLeadMatch - prevents matching empty fields', (t) => {
  const lead = { email: '', mobile_without_country_code: '' };
  assert.strictEqual(isLeadMatch(lead, '', ''), false);
  assert.strictEqual(isLeadMatch(lead, '  ', '  '), false);
});

test('isLeadMatch - requires both to match if both email and mobile are provided', (t) => {
  const lead = { email: 'john.doe@example.com', mobile_without_country_code: '9876543210' };
  assert.strictEqual(isLeadMatch(lead, 'john.doe@example.com', '9876543210'), true);
  assert.strictEqual(isLeadMatch(lead, 'john.doe@example.com', '1111111111'), false);
  assert.strictEqual(isLeadMatch(lead, 'wrong@example.com', '9876543210'), false);
});

test('Deduplication rules logic', (t) => {
  const existingLeads = [
    { name: 'John Doe', email: 'john@example.com', mobile_without_country_code: '9876543210' },
    { name: 'Sarah Connor', email: 'sarah@example.com', mobile_without_country_code: '1111111111' },
    { name: 'Office Reception', email: '', mobile_without_country_code: '2222222222' }
  ];

  assert.strictEqual(checkIsDuplicate({ name: 'John Smith', email: 'john@example.com', mobile_without_country_code: '5555555555' }, existingLeads), true);
  assert.strictEqual(checkIsDuplicate({ name: 'Jane Doe', email: 'jane@example.com', mobile_without_country_code: '9876543210' }, existingLeads), false);
  assert.strictEqual(checkIsDuplicate({ name: 'John Doe', email: 'john.new@example.com', mobile_without_country_code: '9876543210' }, existingLeads), true);
  assert.strictEqual(checkIsDuplicate({ name: 'Office Main Room', email: '', mobile_without_country_code: '2222222222' }, existingLeads), true);
});
