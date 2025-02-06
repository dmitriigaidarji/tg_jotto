// Import the test function from Bun
import { test, expect } from "bun:test";
import { addHours, differenceInHours } from "date-fns";

// A simple function to be tested
function add(a: number, b: number) {
  return a + b;
}

function diffDates() {
  return differenceInHours(addHours(new Date(), 3), new Date());
}

// Define a test case
test("add function should correctly add two numbers", () => {
  const result = add(2, 3);
  if (result !== 5) {
    throw new Error(`Expected 5, but got ${result}`);
  }
});

// Another test case
test("add function should return a number", () => {
  const result = add(2, 3);
  if (typeof result !== "number") {
    throw new Error(`Expected a number, but got ${typeof result}`);
  }
});

test("date diff is a positive number", () => {
  expect(diffDates()).toBeGreaterThan(0);
});
