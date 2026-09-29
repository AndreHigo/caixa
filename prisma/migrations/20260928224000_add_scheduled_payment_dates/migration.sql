ALTER TABLE "Expense" ADD COLUMN "paymentDate" DATETIME;
ALTER TABLE "RecurringExpense" ADD COLUMN "paymentDay" INTEGER;
ALTER TABLE "RecurringExpenseOccurrence" ADD COLUMN "paymentDate" DATETIME;
ALTER TABLE "Loan" ADD COLUMN "paymentDay" INTEGER;
