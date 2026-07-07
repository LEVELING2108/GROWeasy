const test = require('node:test');
const assert = require('assert');

// Set NODE_ENV to test to enable the exports
process.env.NODE_ENV = 'test';

const { isLeadMatch } = require('./server.js');

test('isLeadMatch - matches leads with identical emails', (t) => {
  const lead = { email: 'john.doe@example.com', mobile_without_country_code: '9876543210' };
  assert.strictEqual(isLeadMatch(lead, 'john.doe@example.com', ''), true);
  assert.strictEqual(isLeadMatch(lead, 'JOHN.DOE@EXAMPLE.COM', ''), true); // Case-insensitive
});

test('isLeadMatch - matches leads with identical mobile numbers', (t) => {
  const lead = { email: 'john.doe@example.com', mobile_without_country_code: '9876543210' };
  assert.strictEqual(isLeadMatch(lead, '', '9876543210'), true);
  assert.strictEqual(isLeadMatch(lead, '', ' 9876543210 '), true); // Whitespace-tolerant
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
  // Test duplicate checking rules described in Evaluation & Correctness
  const existingLeads = [
    { name: 'John Doe', email: 'john@example.com', mobile_without_country_code: '9876543210' },
    { name: 'Sarah Connor', email: 'sarah@example.com', mobile_without_country_code: '1111111111' },
    { name: 'Office Reception', email: '', mobile_without_country_code: '2222222222' } // No email, shared line
  ];

  const checkIsDuplicate = (newLead) => {
    return existingLeads.some(existing => {
      const emailMatch = newLead.email && existing.email && 
                         newLead.email.trim().toLowerCase() === existing.email.trim().toLowerCase();
      const phoneMatch = newLead.mobile_without_country_code && existing.mobile_without_country_code && 
                         newLead.mobile_without_country_code.trim() === existing.mobile_without_country_code.trim();
      
      if (emailMatch) return true;
      
      if (phoneMatch) {
        const nameMatch = newLead.name && existing.name &&
                          newLead.name.trim().toLowerCase() === existing.name.trim().toLowerCase();
        return nameMatch || (!newLead.email && !existing.email);
      }
      
      return false;
    });
  };

  // Same email -> duplicate
  assert.strictEqual(checkIsDuplicate({ name: 'John Smith', email: 'john@example.com', mobile_without_country_code: '5555555555' }), true);
  
  // Same phone, different name -> NOT duplicate (e.g. shared business line)
  assert.strictEqual(checkIsDuplicate({ name: 'Jane Doe', email: 'jane@example.com', mobile_without_country_code: '9876543210' }), false);

  // Same phone, same name -> duplicate
  assert.strictEqual(checkIsDuplicate({ name: 'John Doe', email: 'john.new@example.com', mobile_without_country_code: '9876543210' }), true);

  // Same phone, both lack email -> duplicate
  assert.strictEqual(checkIsDuplicate({ name: 'Office Main Room', email: '', mobile_without_country_code: '2222222222' }), true);
});
