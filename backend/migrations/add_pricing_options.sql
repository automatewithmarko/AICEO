-- Add pricing_options JSONB column to products table
-- Stores multiple pricing tiers per product with Stripe/Whop IDs
-- Run this in Supabase SQL editor

ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_options jsonb;
