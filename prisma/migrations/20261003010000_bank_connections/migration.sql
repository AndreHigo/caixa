-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "connectorId" INTEGER NOT NULL,
    "institution" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPDATING',
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "consentExpiresAt" TIMESTAMP(3),
    "syncStartedAt" TIMESTAMP(3),
    "refreshRequestedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "numberLast4" TEXT,
    "balanceCents" INTEGER,
    "limitCents" INTEGER,
    "availableLimitCents" INTEGER,
    "closingDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerCategory" TEXT,
    "suggestedCategory" TEXT,
    "operationType" TEXT,
    "billExternalId" TEXT,
    "installmentNumber" INTEGER,
    "totalInstallments" INTEGER,
    "referenceMonth" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'NEW',
    "linkedKind" TEXT,
    "linkedId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankBill" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "closingDate" TIMESTAMP(3),
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "BankBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_itemId_key" ON "BankConnection"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_userId_connectorId_key" ON "BankConnection"("userId", "connectorId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_externalId_key" ON "BankAccount"("externalId");

-- CreateIndex
CREATE INDEX "BankAccount_connectionId_active_idx" ON "BankAccount"("connectionId", "active");

-- CreateIndex
CREATE INDEX "BankTransaction_userId_date_reviewStatus_idx" ON "BankTransaction"("userId", "date", "reviewStatus");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_externalId_idx" ON "BankTransaction"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_accountId_stableKey_key" ON "BankTransaction"("accountId", "stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_userId_linkedKind_linkedId_key" ON "BankTransaction"("userId", "linkedKind", "linkedId");

-- CreateIndex
CREATE UNIQUE INDEX "BankBill_accountId_externalId_key" ON "BankBill"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankBill" ADD CONSTRAINT "BankBill_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
