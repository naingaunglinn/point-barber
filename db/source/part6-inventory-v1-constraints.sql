-- Point Barbershop — Part 6 v1 (🔒 D-DB-10) · Inventory · DBML မှာ ရေးလို့မရတဲ့ constraint
-- v1.1 (02/Oct/2026 — G (owner one-sheet 02/Oct 00:06) · G (c)) = DB Part 6 v1.2: stock_movements_client_request_uq (partial unique — usage / manual adjust double tap)
--      · append-only trigger (stock_movements_no_update) မပြောင်း — key = INSERT မှာပဲ ထည့်, UPDATE / DELETE ✖ ဆက်

-- ═══════════ Part 4 future FK ပြေ (§6.5 #9) ═══════════
ALTER TABLE sale_items ADD CONSTRAINT sale_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id);

-- ═══════════ master ═══════════
ALTER TABLE product_categories ADD CONSTRAINT product_categories_status_chk CHECK (status IN (0, 1));
CREATE UNIQUE INDEX product_categories_name_active ON product_categories (company_id, name_mm) WHERE archived_at IS NULL;

ALTER TABLE products ADD CONSTRAINT products_status_chk CHECK (status IN (0, 1));
-- D-PAY-03: ရောင်းမယ့် product ⇒ ဈေး
ALTER TABLE products ADD CONSTRAINT products_sell_price_chk
  CHECK ((is_sellable AND sell_price_amount IS NOT NULL AND sell_price_amount >= 0) OR (NOT is_sellable AND sell_price_amount IS NULL));
ALTER TABLE products ADD CONSTRAINT products_threshold_chk CHECK (default_low_stock_threshold IS NULL OR default_low_stock_threshold >= 0);
CREATE UNIQUE INDEX products_name_active ON products (company_id, name_mm) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX products_sku_active  ON products (company_id, sku) WHERE sku IS NOT NULL AND archived_at IS NULL;

ALTER TABLE suppliers ADD CONSTRAINT suppliers_status_chk CHECK (status IN (0, 1));
CREATE UNIQUE INDEX suppliers_name_active ON suppliers (company_id, name) WHERE archived_at IS NULL;

ALTER TABLE stock_adjustment_reasons ADD CONSTRAINT stock_adjustment_reasons_status_chk CHECK (status IN (0, 1));
CREATE UNIQUE INDEX stock_adjustment_reasons_name ON stock_adjustment_reasons (company_id, name_mm);

-- ═══════════ branch_stock_levels ═══════════
ALTER TABLE branch_stock_levels ADD CONSTRAINT branch_stock_levels_threshold_chk CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);
-- Low stock list (D-STK-06)
CREATE INDEX branch_stock_levels_low ON branch_stock_levels (branch_id) WHERE low_stock_notified_at IS NULL;

-- ═══════════ stock_movements (append-only ledger) ═══════════
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_chk CHECK (movement_type BETWEEN 1 AND 8);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_delta_chk CHECK (quantity_delta <> 0);
-- Type ⇔ sign ⇔ ref (တစ်ခုတည်း)
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_refs_chk CHECK (
  (movement_type = 1 AND quantity_delta > 0 AND purchase_item_id IS NOT NULL
     AND stock_transfer_item_id IS NULL AND sale_item_id IS NULL AND refund_item_id IS NULL AND stock_count_item_id IS NULL AND adjustment_reason_id IS NULL)
  OR (movement_type = 2 AND quantity_delta < 0 AND stock_transfer_item_id IS NOT NULL
     AND purchase_item_id IS NULL AND sale_item_id IS NULL AND refund_item_id IS NULL AND stock_count_item_id IS NULL AND adjustment_reason_id IS NULL)
  OR (movement_type = 3 AND quantity_delta > 0 AND stock_transfer_item_id IS NOT NULL
     AND purchase_item_id IS NULL AND sale_item_id IS NULL AND refund_item_id IS NULL AND stock_count_item_id IS NULL AND adjustment_reason_id IS NULL)
  OR (movement_type = 4 AND quantity_delta < 0 AND sale_item_id IS NOT NULL
     AND purchase_item_id IS NULL AND stock_transfer_item_id IS NULL AND refund_item_id IS NULL AND stock_count_item_id IS NULL AND adjustment_reason_id IS NULL)
  OR (movement_type = 5 AND quantity_delta > 0 AND refund_item_id IS NOT NULL
     AND purchase_item_id IS NULL AND stock_transfer_item_id IS NULL AND sale_item_id IS NULL AND stock_count_item_id IS NULL AND adjustment_reason_id IS NULL)
  OR (movement_type = 6 AND quantity_delta < 0
     AND purchase_item_id IS NULL AND stock_transfer_item_id IS NULL AND sale_item_id IS NULL AND refund_item_id IS NULL AND stock_count_item_id IS NULL)
  OR (movement_type = 7 AND stock_count_item_id IS NOT NULL
     AND purchase_item_id IS NULL AND stock_transfer_item_id IS NULL AND sale_item_id IS NULL AND refund_item_id IS NULL AND adjustment_reason_id IS NULL)
  OR (movement_type = 8 AND adjustment_reason_id IS NOT NULL
     AND purchase_item_id IS NULL AND stock_transfer_item_id IS NULL AND sale_item_id IS NULL AND refund_item_id IS NULL AND stock_count_item_id IS NULL)
);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_business_date_chk
  CHECK (business_date = (occurred_at AT TIME ZONE 'Asia/Yangon')::date);
-- ref ၁ ခု movement ၁ ခု (transfer item = OUT + IN)
CREATE UNIQUE INDEX stock_movements_one_purchase   ON stock_movements (purchase_item_id) WHERE purchase_item_id IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_one_transfer   ON stock_movements (stock_transfer_item_id, movement_type) WHERE stock_transfer_item_id IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_one_sale       ON stock_movements (sale_item_id) WHERE sale_item_id IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_one_refund     ON stock_movements (refund_item_id) WHERE refund_item_id IS NOT NULL;
CREATE UNIQUE INDEX stock_movements_one_count_item ON stock_movements (stock_count_item_id) WHERE stock_count_item_id IS NOT NULL;
-- v1.1 G (c): Idempotency-Key (P6.STK.05 usage · P6.STK.07 manual adjust — API P6-RULE-12) — ref မရှိတဲ့ movement ၂ ခါ ✖ · NULL = key မလို (FINISH / post / receive / count)
CREATE UNIQUE INDEX stock_movements_client_request_uq ON stock_movements (client_request_id) WHERE client_request_id IS NOT NULL;
-- Append-only (D-STK-06 history · D-DAT-05) — app DB user ကို UPDATE / DELETE ✖ (Part 8 grant); ဒီမှာ rule trigger
CREATE FUNCTION stock_movements_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'stock_movements is append-only (D-STK-06)'; END $$;
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_immutable();

-- ═══════════ purchases ═══════════
ALTER TABLE purchases ADD CONSTRAINT purchases_status_chk CHECK (status IN (0, 1, 2));
ALTER TABLE purchases ADD CONSTRAINT purchases_total_chk CHECK (total_amount >= 0);
ALTER TABLE purchases ADD CONSTRAINT purchases_business_date_chk
  CHECK (business_date = (purchased_at AT TIME ZONE 'Asia/Yangon')::date);
ALTER TABLE purchases ADD CONSTRAINT purchases_status_fields_chk CHECK (
  (status = 1 AND posted_at IS NULL AND cancelled_at IS NULL)
  OR (status = 2 AND posted_at IS NOT NULL AND posted_by_user_id IS NOT NULL AND cancelled_at IS NULL)
  OR (status = 0 AND cancelled_at IS NOT NULL AND posted_at IS NULL)
);
ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_values_chk CHECK (quantity > 0 AND unit_cost_amount >= 0);
ALTER TABLE purchase_items ADD COLUMN line_total_amount bigint GENERATED ALWAYS AS (quantity * unit_cost_amount) STORED;

-- ═══════════ stock_transfers (D-STK-03 v5.1 — ၂ ဆင့်) ═══════════
ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_chk   CHECK (status IN (0, 1, 2, 3));
ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_branches_chk CHECK (from_branch_id <> to_branch_id);
ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_receiver_chk CHECK (
  (receiver_type = 1 AND receiver_employee_id IS NOT NULL) OR (receiver_type = 2 AND receiver_employee_id IS NULL)
);
-- DRAFT → SENT → RECEIVED · CANCELLED = DRAFT ကနေပဲ (SENT ပြီး cancel ✖ — stock ထွက်ပြီ)
ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_fields_chk CHECK (
  (status = 1 AND sent_at IS NULL AND received_at IS NULL AND cancelled_at IS NULL)
  OR (status = 2 AND sent_at IS NOT NULL AND sent_by_user_id IS NOT NULL AND received_at IS NULL AND cancelled_at IS NULL)
  OR (status = 3 AND sent_at IS NOT NULL AND sent_by_user_id IS NOT NULL AND received_at IS NOT NULL AND received_by_user_id IS NOT NULL
      AND received_at >= sent_at AND cancelled_at IS NULL)
  OR (status = 0 AND cancelled_at IS NOT NULL AND sent_at IS NULL AND received_at IS NULL)
);
ALTER TABLE stock_transfer_items ADD CONSTRAINT stock_transfer_items_qty_chk
  CHECK (quantity_sent > 0 AND (quantity_received IS NULL OR quantity_received >= 0));
-- Receive: actual ≠ sent ⇒ reason (D-STK-03)
ALTER TABLE stock_transfer_items ADD CONSTRAINT stock_transfer_items_difference_chk CHECK (
  quantity_received IS NULL
  OR quantity_received = quantity_sent
  OR (difference_reason IS NOT NULL AND btrim(difference_reason) <> '')
);

-- ═══════════ stock_counts (D-STK-05) ═══════════
ALTER TABLE stock_counts ADD CONSTRAINT stock_counts_status_chk CHECK (status IN (0, 1, 2));
ALTER TABLE stock_counts ADD CONSTRAINT stock_counts_status_fields_chk CHECK (
  (status = 1 AND posted_at IS NULL AND cancelled_at IS NULL)
  OR (status = 2 AND posted_at IS NOT NULL AND posted_by_user_id IS NOT NULL AND posted_at >= started_at AND cancelled_at IS NULL)
  OR (status = 0 AND cancelled_at IS NOT NULL AND posted_at IS NULL)
);
CREATE UNIQUE INDEX stock_counts_one_in_progress ON stock_counts (branch_id) WHERE status = 1;
ALTER TABLE stock_count_items ADD CONSTRAINT stock_count_items_counted_chk CHECK (counted_quantity IS NULL OR counted_quantity >= 0);
ALTER TABLE stock_count_items ADD COLUMN difference_quantity integer GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED;

-- ═══════════ App / Part 8 trigger က စစ်ရမယ့်ဟာ (cross-table) ═══════════
-- · branch_stock_levels.quantity_on_hand = Σ movements (same tx · ညတိုင်း recompute + မကိုက်ရင် admin noti)
-- · purchase POSTED ⇒ item တိုင်း PURCHASE_IN movement (branch = item.branch) · POSTED / CANCELLED ⇒ items ပြင် ✖
-- · transfer SENT ⇒ item တိုင်း TRANSFER_OUT (from, −sent) · RECEIVED ⇒ TRANSFER_IN (to, +received) · SENT ပြီး items ပြင် ✖ · counted NULL ⇒ POST ✖
-- · sale FINISH ⇒ PRODUCT line တိုင်း SALE_OUT (sale.branch) · refund kind 1 product line ⇒ SALE_RETURN_IN
-- · stock_count POSTED ⇒ items counted NOT NULL · difference ≠ 0 ⇒ COUNT_ADJUST movement (delta = difference)
-- · low stock: quantity_on_hand ≤ threshold ⇒ noti (notified_at NULL ဆို) · ပြန်ကျော်ရင် notified_at = NULL
-- · product is_sellable = false ⇒ sale line ✖ · archived product ⇒ purchase / sale ✖ (stock ကျန် ရှိရင် archive ✖)
-- · usage / manual adjust: client_request_id = Idempotency-Key (v1.1) — 23505 on stock_movements_client_request_uq = replay (200, same movement) · key တူ / body မတူ = 422 idempotency_mismatch (app)
