-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "whatsappNumber" TEXT;
