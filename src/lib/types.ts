export type AddressKind = "home" | "work" | "other";

export type OccasionKind =
  | "birthday"
  | "anniversary"
  | "valentines"
  | "mothers_day"
  | "christmas"
  | "apology"
  | "just_because"
  | "custom";

export type MissionStatus =
  | "scheduled"
  | "placed"
  | "shipped"
  | "delivered"
  | "canceled"
  | "failed";

export type User = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  timezone: string;
  auto_pilot: number;
  payment_ok: number;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  /** ISO timestamp of the last "your year is nearly up" nudge, or "". */
  renewal_nudged_at: string;
  /** SHA-256 of the emailed password-reset token, or "" when none is live. */
  reset_token_hash: string;
  reset_token_expires: string;
  /** The budget Cover Everything and the planner start from. */
  default_budget_cents: number;
  created_at: string;
};

export type Recipient = {
  id: string;
  user_id: string;
  name: string;
  relationship: string;
  likes: string;
  dislikes: string;
  allergies: string;
  notes: string;
  created_at: string;
};

export type Address = {
  id: string;
  user_id: string;
  recipient_id: string;
  kind: AddressKind;
  nickname: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  window_start: string;
  window_end: string;
  weekdays_only: number;
  delivery_notes: string;
  created_at: string;
};

export type Occasion = {
  id: string;
  user_id: string;
  recipient_id: string;
  kind: OccasionKind;
  title: string;
  event_date: string;
  recurring: number;
  created_at: string;
};

export type Mission = {
  id: string;
  user_id: string;
  occasion_id: string;
  recipient_id: string;
  address_id: string;
  product_id: string;
  selection_mode: "manual" | "auto";
  budget_cents: number;
  price_cents: number;
  gift_message: string;
  deliver_on: string;
  ship_on: string;
  status: MissionStatus;
  vendor_id: string;
  vendor_order_ref: string;
  failure_reason: string;
  charge_ref: string;
  vendor_payload: string;
  /** Partner commission earned on this order, captured at placement time. */
  affiliate_cents: number;
  /** Carrier tracking link, when the vendor reports one. Empty until then. */
  tracking_url: string;
  /** The member's verdict on a delivered gift: '' until rated. */
  feedback: "" | "hit" | "miss";
  created_at: string;
  updated_at: string;
};

export type MissionEvent = {
  id: string;
  mission_id: string;
  status: string;
  note: string;
  at: string;
};
