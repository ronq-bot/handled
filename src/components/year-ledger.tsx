const ENTRIES = [
  { date: "14 February", occasion: "Valentine's Day", gift: "Truffle collection", to: "Home" },
  { date: "10 May", occasion: "Mother's Day", gift: "Seasonal tulips", to: "Her mother" },
  { date: "20 August", occasion: "Her birthday", gift: "Garden bouquet", to: "Her office" },
  { date: "25 September", occasion: "Your anniversary", gift: "Fruit arrangement", to: "Home" },
  { date: "25 December", occasion: "Christmas", gift: "At our discretion", to: "Home" },
];

/**
 * The year as a concierge itinerary rather than a chart. Ruled rows, serif
 * dates, everything aligned — it should read like something printed and
 * handed to you, which is precisely what the service is.
 */
export function YearLedger() {
  return (
    <div className="border-t border-line">
      {ENTRIES.map((e) => (
        <article
          key={e.date}
          className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-line py-7 sm:grid-cols-[11rem_1fr_auto] sm:items-baseline"
        >
          <p className="serif text-[1.35rem] leading-none text-forest">{e.date}</p>

          <div>
            <p className="text-[1.0625rem] text-ink">{e.gift}</p>
            <p className="mt-1 text-[0.9375rem] text-muted">{e.occasion}</p>
          </div>

          <p className="smallcaps-quiet whitespace-nowrap sm:text-right">{e.to}</p>
        </article>
      ))}
    </div>
  );
}
