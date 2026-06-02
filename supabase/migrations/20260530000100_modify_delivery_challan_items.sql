-- Migration: modify delivery_challan_items to support manual items
-- 1. Make product_id nullable
ALTER TABLE public.delivery_challan_items
  ALTER COLUMN product_id DROP NOT NULL;

-- 2. Add manual item fields
ALTER TABLE public.delivery_challan_items
  ADD COLUMN item_name TEXT,
  ADD COLUMN item_code TEXT,
  ADD COLUMN description TEXT;

-- 3. Optional check constraint to ensure either product_id or manual item name exists
ALTER TABLE public.delivery_challan_items
  ADD CONSTRAINT chk_delivery_challan_items_product_or_manual
    CHECK (
      (product_id IS NOT NULL) OR
      (item_name IS NOT NULL AND item_name <> '')
    );
