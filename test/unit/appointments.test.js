const test = require("node:test");
const assert = require("node:assert/strict");
const {
  currentOttawaDate,
  currentOttawaMonth,
  formatDate,
  formatTime,
  has24HoursNotice,
  validSlot,
} = require("../../src/appointments");

test("appointment slots accept only valid dates and offered times", () => {
  assert.equal(validSlot("2099-06-15", "08:00"), true);
  assert.equal(validSlot("2099-06-15", "16:00"), true);
  assert.equal(validSlot("2099-06-15", "09:00"), false);
  assert.equal(validSlot("2099-02-29", "08:00"), false);
  assert.equal(validSlot("2099-06-15", "08:00", false), true);
});

test("appointment date and time formatting is customer-readable", () => {
  assert.equal(formatDate("2026-10-25"), "Sunday, October 25, 2026");
  assert.equal(formatTime("08:00:00"), "8:00 a.m.");
  assert.equal(formatTime("16:00"), "4:00 p.m.");
});

test("Ottawa calendar helpers return matching date and month formats", () => {
  assert.match(currentOttawaDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(currentOttawaMonth(), currentOttawaDate().slice(0, 7));
});

test("far-future appointments have sufficient rescheduling notice", () => {
  assert.equal(has24HoursNotice("2099-06-15", "08:00"), true);
});
