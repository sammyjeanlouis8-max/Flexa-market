import { test } from "node:test";
import assert from "node:assert/strict";
import { addKnown, formatMinor, formatDate, monthLabel } from "../sales-report-format";

test("minor amounts beyond Number precision retain every cent", () => {
  assert.equal(formatMinor("900719925474099399",2,"USD","en"),"9,007,199,254,740,993.99 USD");
  assert.equal(addKnown("900719925474099399","2"),"900719925474099401");
});
test("unknown amounts do not turn into zeros", () => {
  assert.equal(formatMinor(null,2,"USD"),null);
  assert.equal(formatMinor("0",2,"USD"),"0.00 USD");
  assert.equal(addKnown(null,"100"),null);
  assert.equal(formatMinor("1.23",2,"USD"),null);
  assert.equal(formatMinor("100",Number.NaN,"USD"),null);
});
test("currency exponents and negative amounts are preserved", () => {
  assert.equal(formatMinor("123",0,"JPY"),"123 JPY");
  assert.equal(formatMinor("123",3,"KWD"),"0.123 KWD");
  assert.equal(formatMinor("-123",2,"USD"),"−1.23 USD");
});
test("French and Haitian formatting uses the correct decimal separator", () => {
  assert.equal(formatMinor("123",2,"EUR","fr"),"1,23 EUR");
  assert.equal(formatMinor("123",2,"HTG","ht"),"1,23 HTG");
});
test("dates use the report timezone and invalid evidence stays unavailable", () => {
  assert.equal(formatDate("invalid","UTC","en"),null);
  assert.equal(formatDate(null,"UTC","en"),null);
  assert.match(formatDate("2026-04-01T02:00:00Z","America/New_York","en")!, /Mar/);
});
test("historical month names use the requested language", () => {
  assert.equal(monthLabel("2026-03","fr"),"mars 2026");
});