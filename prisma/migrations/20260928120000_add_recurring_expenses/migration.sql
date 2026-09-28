-- Add payment timestamps used by explicit baixa actions.
ALTER TABLE "CardInvoice" ADD COLUMN "paidAt" DATETIME;
ALTER TABLE "Expense" ADD COLUMN "paidAt" DATETIME;
ALTER TABLE "Loan" ADD COLUMN "lastPaidAt" DATETIME;

CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "firstDueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "RecurringExpenseOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recurringId" TEXT NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    CONSTRAINT "RecurringExpenseOccurrence_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RecurringExpense_userId_status_firstDueDate_idx" ON "RecurringExpense"("userId", "status", "firstDueDate");
CREATE INDEX "RecurringExpenseOccurrence_referenceMonth_status_idx" ON "RecurringExpenseOccurrence"("referenceMonth", "status");
CREATE UNIQUE INDEX "RecurringExpenseOccurrence_recurringId_referenceMonth_key" ON "RecurringExpenseOccurrence"("recurringId", "referenceMonth");
