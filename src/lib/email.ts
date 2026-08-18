import "server-only";
import { env } from "./env";
import { formatLong } from "./date";

/**
 * Transactional email via Resend's HTTP API — no SDK, one fetch.
 *
 * Without a key, messages are logged rather than sent. Sending must never be
 * able to fail a shipment: every function here swallows its own errors and
 * reports them, because a bounced receipt is not a reason to cancel a gift.
 */

type Mail = { to: string; subject: string; heading: string; body: string[]; footer?: string };

const FRAME = (m: Mail) => `
<div style="background:#faf7f2;padding:40px 20px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fffdfa;border:1px solid #e0d8c9;border-radius:18px;padding:40px">
    <p style="margin:0 0 28px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#7e5f30">Handled</p>
    <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:400;font-size:26px;line-height:1.25;color:#22201c">${m.heading}</h1>
    ${m.body.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#5a5750">${p}</p>`).join("")}
    <hr style="border:0;border-top:1px solid #e0d8c9;margin:32px 0 20px" />
    <p style="margin:0;font-size:12px;line-height:1.6;color:#6e6a60">${
      m.footer ?? "You are receiving this because you have a standing order with Handled."
    }</p>
  </div>
</div>`;


/**
 * The templates interpolate user-entered text (names, occasion titles, gift
 * messages, vendor error strings) into HTML. Escaping here keeps a crafted
 * occasion title from becoming markup in mail sent from our domain.
 */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function send(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  if (!env.resendApiKey) {
    console.info(`[email:not-configured] → ${mail.to} · ${mail.subject}`);
    return { ok: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [mail.to],
        subject: mail.subject,
        html: FRAME(mail),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`[email:failed] ${response.status} ${detail}`);
      return { ok: false, error: `Resend returned ${response.status}` };
    }
    return { ok: true };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "unknown";
    console.error(`[email:failed] ${error}`);
    return { ok: false, error };
  }
}

type OrderMail = {
  to: string;
  firstName: string;
  gift: string;
  recipient: string;
  occasion: string;
  deliverOn: string;
  where: string;
};

export function emailOrderPlaced(o: OrderMail) {
  return send({
    to: o.to,
    subject: `Ordered — ${o.gift} for ${o.recipient}`,
    heading: "That's placed.",
    body: [
      `${esc(o.firstName)}, the order for <strong>${esc(o.occasion)}</strong> has gone in.`,
      `<strong>${esc(o.gift)}</strong> arrives ${formatLong(o.deliverOn)}, ${esc(o.where)}.`,
      "Nothing further is required from you. That is rather the point.",
    ],
  });
}

export function emailUpcomingOrder(
  o: OrderMail & { daysUntilShip: number; changeUrl: string },
) {
  const when = o.daysUntilShip <= 1 ? "tomorrow" : `in ${o.daysUntilShip} days`;
  return send({
    to: o.to,
    subject: `Going out ${when} — ${o.gift} for ${o.recipient}`,
    heading: `This goes out ${when}.`,
    body: [
      `${esc(o.firstName)}, <strong>${esc(o.gift)}</strong> for ${esc(o.occasion)} is scheduled to be ordered ${when}, arriving ${formatLong(o.deliverOn)} ${esc(o.where)}.`,
      "Nothing to do if that's right — it'll go in on its own and you'll get a receipt.",
      `Want a different gift, or to move the date? <a href="${o.changeUrl}" style="color:#1f3d2b">Change it before it ships →</a>`,
    ],
    footer:
      "This is a heads-up, not an action item. To cancel a gift outright rather than change it, log in and use Cancel on the gift's page — we don't put a cancel link in email.",
  });
}

export function emailArrivingToday(o: OrderMail) {
  return send({
    to: o.to,
    subject: `Arriving today — ${o.gift} for ${o.recipient}`,
    heading: "It lands today.",
    body: [
      `<strong>${esc(o.gift)}</strong> reaches ${esc(o.recipient)} today, ${esc(o.where)}.`,
      "Act natural. Perhaps ask how her day was, around six.",
    ],
  });
}

export function emailDelivered(o: OrderMail) {
  return send({
    to: o.to,
    subject: `Delivered — ${o.gift} for ${o.recipient}`,
    heading: "Delivered.",
    body: [
      `<strong>${esc(o.gift)}</strong> was delivered to ${esc(o.recipient)} for ${esc(o.occasion)}.`,
      "You did nothing. The brownie points are yours regardless.",
    ],
  });
}

export function emailRenewal(o: {
  to: string;
  firstName: string;
  lastDate: string;
  dateCount: number;
  planUrl: string;
}) {
  return send({
    to: o.to,
    subject: "Your year is nearly up",
    heading: "Time to set the next twelve months.",
    body: [
      `${esc(o.firstName)}, the last gift on your calendar goes out ${formatLong(o.lastDate)}. After that there is nothing scheduled.`,
      `Your ${o.dateCount === 1 ? "date is" : `${o.dateCount} dates are`} still on file and will roll forward — we just need you to choose what goes out against them, which is also a good moment to change a budget or an address if anything has moved.`,
      `<a href="${o.planUrl}" style="color:#1f3d2b">Set the next twelve months →</a>`,
    ],
    footer:
      "We schedule a year at a time on purpose. Prices, addresses and cards all drift, and we would rather ask than guess.",
  });
}

export function emailRescued(
  o: OrderMail & { originalGift: string; reason: string; changeUrl: string },
) {
  return send({
    to: o.to,
    subject: `Swapped — ${o.occasion}`,
    heading: "Handled, differently.",
    body: [
      `${esc(o.firstName)}, the ${esc(o.originalGift)} for <strong>${esc(o.occasion)}</strong> fell through: <em>${esc(o.reason)}</em>`,
      `Auto-Pilot has already replaced it. <strong>${esc(o.gift)}</strong> now arrives ${formatLong(o.deliverOn)} instead — same budget, same date, still her taste.`,
      `Disagree with the pick? <a href="${o.changeUrl}" style="color:#1f3d2b">Choose something else before it ships →</a>`,
    ],
    footer:
      "This is Auto-Pilot doing its job. Nothing is required from you unless you want a different replacement.",
  });
}

export function emailPasswordReset(o: { to: string; firstName: string; resetUrl: string }) {
  return send({
    to: o.to,
    subject: "Reset your password — Handled",
    heading: "Locked out. Fixable.",
    body: [
      `${esc(o.firstName)}, someone — hopefully you — asked to reset the password on this account.`,
      `<a href="${o.resetUrl}" style="color:#1f3d2b">Choose a new password →</a>`,
      `The link works once and expires in an hour. If this wasn't you, do nothing — the account stays exactly as it is.`,
    ],
    footer: "Nobody at Handled will ever ask you for your password.",
  });
}

export function emailFailed(o: OrderMail & { reason: string; fixUrl: string }) {
  return send({
    to: o.to,
    subject: `Needs you — ${o.occasion}`,
    heading: "One thing needs you.",
    body: [
      `We could not place the order for <strong>${esc(o.occasion)}</strong>.`,
      `<em>${esc(o.reason)}</em>`,
      `There is still time — ${esc(o.gift)} was due ${formatLong(o.deliverOn)}.`,
      `<a href="${o.fixUrl}" style="color:#1f3d2b">Put it right in one click →</a>`,
    ],
    footer: "This is the only email we will ever send you that requires action.",
  });
}
