import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { MarketingHeader, SiteFooter } from "@/components/site-chrome";
import { YearLedger } from "@/components/year-ledger";
import { Reveal } from "@/components/reveal";
import { BouquetMark, FruitMark, CalendarMark, SealMark } from "@/components/illustrations";
import { ProductImage } from "@/components/product-image";
import { PRODUCTS, VENDORS, formatMoney, CATEGORY_LABELS, getVendor } from "@/lib/catalog";

const CATALOGUE_IDS = [
  "bouquet_signature_roses",
  "fruit_bouquet_celebration",
  "champagne_celebration",
  "necklace_birthstone",
  "spa_ritual_box",
  "dinner_voucher",
];

const PLATES = [
  {
    Mark: BouquetMark,
    plate: "Plate I",
    title: "Flowers, on the day",
    body: "Hand-tied and delivered to her desk before eleven, so the office sees them.",
  },
  {
    Mark: CalendarMark,
    plate: "Plate II",
    title: "Every date, once",
    body: "Entered in a single sitting. Recurring dates roll forward on their own each year.",
  },
  {
    Mark: FruitMark,
    plate: "Plate III",
    title: "Or something to share",
    body: "Fruit, confectionery, a table booked for two. Chosen by you, or left with us.",
  },
];

const STEPS = [
  {
    n: "I",
    title: "You give us the dates",
    body: "Her birthday. Your anniversary. Valentine's, Mother's Day, the day you met. Recurring dates roll forward each year on their own, so you enter them exactly once.",
    aside: "Four minutes, one time.",
  },
  {
    n: "II",
    title: "You choose the gift, or you don't",
    body: "Select from the catalogue yourself, or leave it with us. We keep a note of what she likes, what she has vetoed, and what she is allergic to — and we never send the same thing twice.",
    aside: "Discretion, on request.",
  },
  {
    n: "III",
    title: "We attend to the day",
    body: "Her desk at ten in the morning, or the hall table at six. The order is placed with the right lead time, and a date that falls on a weekend moves to the Friday before without being asked.",
    aside: "You are not involved.",
  },
];

export default async function LandingPage() {
  const user = await currentUser();
  const catalogue = CATALOGUE_IDS.map((id) => PRODUCTS.find((p) => p.id === id)).filter(
    (p) => p !== undefined,
  );
  const houses = Object.values(VENDORS).map((v) => v.name);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <MarketingHeader signedIn={Boolean(user)} />

      <main id="main" className="flex-1">
        {/* ── Hero ────────────────────────────────────────────── */}
        <section className="border-b border-line">
          {/* `.enter` rather than <Reveal>: this is above the fold and must
              not depend on hydration to become visible. */}
          <div className="container-tight py-24 text-center md:py-32">
            <div className="enter flex justify-center">
              <SealMark className="drift h-16 w-16 text-brass" />
            </div>

            <div className="enter" style={{ animationDelay: "0.08s" }}>
              <p className="smallcaps mt-8">Est. for the chronically forgetful</p>
              <hr className="rule-brass mx-auto mt-6" />
            </div>

            <div className="enter" style={{ animationDelay: "0.16s" }}>
              <h1 className="display-1 mt-10 text-ink">
                Never forget her
                <br />
                birthday <em className="italic text-forest">ever</em> again.
              </h1>
            </div>

            <div className="enter" style={{ animationDelay: "0.24s" }}>
              <p className="lede mx-auto mt-9">
                A standing order for the dates that matter. You set them once, in a single sitting.
                For the next twelve months the right gift arrives on the right day, at the right
                address, without you lifting a finger or remembering a thing.
              </p>
            </div>

            <div className="enter" style={{ animationDelay: "0.32s" }}>
              <div className="mt-12 flex flex-wrap items-center justify-center gap-5">
                <Link href="/signup" className="btn btn-primary btn-lg">
                  Open an account
                </Link>
                <Link href="#how" className="link-rule">
                  How it works
                </Link>
              </div>
              <p className="mt-10 text-[0.9375rem] text-faint">
                No card required to plan the year. You are charged only when something ships.
              </p>
            </div>
          </div>

          <div className="enter" style={{ animationDelay: "0.4s" }}>
            <div className="container-tight pb-20 md:pb-28">
              <img
                src="/marketing/hero.jpg"
                alt="A hand-tied bouquet of roses beside a wrapped gift box and an open desk calendar"
                width={1600}
                height={1075}
                className="w-full rounded-[--radius-lg] border border-line object-cover shadow-[0_30px_60px_-30px_rgba(34,32,28,0.35)]"
              />
            </div>
          </div>
        </section>

        {/* ── Houses we order from ────────────────────────────── */}
        <section className="marquee overflow-hidden border-b border-line bg-bone-2 py-7">
          <div className="marquee-track gap-16 px-8">
            {[...houses, ...houses].map((name, i) => (
              <span
                key={`${name}-${i}`}
                className="serif whitespace-nowrap text-[1.15rem] text-faint"
                aria-hidden={i >= houses.length}
              >
                {name}
              </span>
            ))}
          </div>
        </section>

        {/* ── Plates ──────────────────────────────────────────── */}
        <section className="section">
          <div className="container-x">
            <div className="grid gap-14 md:grid-cols-3 md:gap-10">
              {PLATES.map(({ Mark, plate, title, body }, i) => (
                <Reveal key={plate} delay={i * 0.12} className="text-center">
                  <div className="flex justify-center">
                    <Mark className="h-52 w-auto text-brass" title={title} />
                  </div>
                  <p className="smallcaps-quiet mt-8">{plate}</p>
                  <h2 className="display-3 mt-3 text-ink">{title}</h2>
                  <p className="mx-auto mt-3 max-w-xs leading-relaxed text-muted">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── The moment it lands ─────────────────────────────── */}
        <section className="border-y border-line">
          <Reveal>
            <img
              src="/marketing/lifestyle-desk.jpg"
              alt="Her hands untying the ribbon on a bouquet that arrived at her desk"
              width={1600}
              height={1073}
              className="h-[26rem] w-full object-cover md:h-[34rem]"
            />
          </Reveal>
        </section>

        {/* ── The year, as an itinerary ───────────────────────── */}
        <section className="section bg-bone-2">
          <div className="container-x">
            <div className="grid gap-14 lg:grid-cols-[22rem_1fr] lg:gap-20">
              <Reveal>
                <p className="smallcaps">The standing order</p>
                <h2 className="display-2 mt-5 text-ink">One sitting. Twelve months.</h2>
                <p className="mt-6 text-[1.0625rem] leading-relaxed text-muted">
                  This is the whole of it — an account set up on an ordinary afternoon in March, and
                  every date on it already handled through to Christmas.
                </p>
              </Reveal>

              <Reveal delay={0.12}>
                <YearLedger />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── How it works ───────────────────────────────────── */}
        <section id="how" className="section">
          <div className="container-x">
            <Reveal className="max-w-2xl">
              <p className="smallcaps">The arrangement</p>
              <h2 className="display-2 mt-5 text-ink">Three steps, and then nothing.</h2>
            </Reveal>

            <div className="mt-16 border-t border-line">
              {STEPS.map((step, i) => (
                <Reveal
                  key={step.n}
                  as="article"
                  delay={i * 0.08}
                  className="grid gap-x-12 gap-y-4 border-b border-line py-12 md:grid-cols-[5rem_1fr_13rem]"
                >
                  <p className="numeral text-4xl">{step.n}</p>

                  <div>
                    <h3 className="display-3 text-ink">{step.title}</h3>
                    <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted">
                      {step.body}
                    </p>
                  </div>

                  <p className="smallcaps-quiet md:text-right">{step.aside}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── The alternative ────────────────────────────────── */}
        <section className="section bg-forest">
          <Reveal className="container-tight text-center">
            <p className="text-[0.75rem] font-medium uppercase tracking-[0.22em] text-brass-light">
              The alternative
            </p>
            <blockquote className="display-2 mt-8 text-on-forest">
              &ldquo;It&apos;s fine. Really. I know you&apos;ve been busy.&rdquo;
            </blockquote>
            <p className="mx-auto mt-9 max-w-xl text-[1.0625rem] leading-relaxed text-on-forest-muted">
              It is not fine. It has never once been fine. Somewhere in the country a man is buying
              cellophane-wrapped carnations at a petrol station at ten to eleven at night, and he is
              telling himself the same thing.
            </p>
          </Reveal>
        </section>

        {/* ── Catalogue ──────────────────────────────────────── */}
        <section id="gifts" className="section">
          <div className="container-x">
            <Reveal className="flex flex-wrap items-end justify-between gap-8">
              <div className="max-w-xl">
                <p className="smallcaps">The catalogue</p>
                <h2 className="display-2 mt-5 text-ink">Nothing from a petrol station.</h2>
                <p className="mt-6 text-[1.0625rem] leading-relaxed text-muted">
                  Flowers, fruit, confectionery, jewellery and experiences from houses that commit to
                  a delivery date and keep it — not &ldquo;five to nine business days, probably.&rdquo;
                </p>
              </div>
              <Link href="/signup" className="link-rule">
                See the full catalogue
              </Link>
            </Reveal>

            <ul className="mt-16 border-t border-line">
              {catalogue.map((p, i) => (
                <Reveal
                  key={p.id}
                  as="li"
                  delay={Math.min(i, 3) * 0.06}
                  className="grid grid-cols-1 items-center gap-x-8 gap-y-3 border-b border-line py-8 sm:grid-cols-[5rem_8rem_1fr_auto]"
                >
                  <ProductImage product={p} sizePx={80} className="hidden sm:block" />

                  <p className="smallcaps-quiet">{CATEGORY_LABELS[p.category]}</p>

                  <div>
                    <h3 className="serif text-[1.35rem] leading-snug text-ink">{p.name}</h3>
                    <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
                      {p.blurb}
                    </p>
                    <p className="mt-2 text-[0.8125rem] text-faint">{getVendor(p.vendorId)?.name}</p>
                  </div>

                  <p className="serif text-[1.35rem] text-forest sm:text-right">
                    {formatMoney(p.priceCents)}
                  </p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Membership ─────────────────────────────────────── */}
        <section id="pricing" className="section bg-bone-2">
          <div className="container-x">
            <Reveal className="max-w-xl">
              <p className="smallcaps">Membership</p>
              <h2 className="display-2 mt-5 text-ink">Considerably cheaper than counselling.</h2>
              <p className="mt-6 text-[1.0625rem] leading-relaxed text-muted">
                Planning is always free. You pay for the gift when it ships, and for whatever degree
                of attention you would like on top.
              </p>
            </Reveal>

            <div className="mt-16 grid gap-6 md:grid-cols-3">
              {[
                {
                  name: "Associate",
                  price: "Free",
                  note: "For the man who insists he has it handled.",
                  features: [
                    "Unlimited dates and recipients",
                    "The full catalogue at list price",
                    "Orders placed automatically",
                    "Reminders by email and push",
                  ],
                  cta: "Open an account",
                  featured: false,
                },
                {
                  name: "Member",
                  price: "$9",
                  suffix: "per month",
                  note: "The one that most people need.",
                  features: [
                    "Everything in Associate",
                    "Gifts chosen on your behalf",
                    "Delivery included on partner gifts",
                    "Rerouting for weather and delays",
                    "Two same-day rescues a year",
                  ],
                  cta: "Become a member",
                  featured: true,
                },
                {
                  name: "Private client",
                  price: "$29",
                  suffix: "per month",
                  note: "For apologies of unusual size.",
                  features: [
                    "Everything in Member",
                    "A named concierge",
                    "Handwritten cards in your hand",
                    "Restaurants and experiences booked",
                    "Unlimited same-day rescues",
                  ],
                  // A named concierge requires a named human, and we have not
                  // hired them yet. Shown but not joinable until we have.
                  comingSoon: true,
                  cta: "Coming soon",
                  featured: false,
                },
              ].map((t, i) => (
                <Reveal
                  key={t.name}
                  delay={i * 0.1}
                  className={`card card-lift flex flex-col p-10 ${
                    t.featured ? "border-forest/40 bg-forest-tint" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="smallcaps">{t.name}</p>
                    {t.comingSoon && (
                      <span className="tag border-brass/60 text-brass-deep">Coming soon</span>
                    )}
                  </div>

                  <p className="serif mt-6 text-5xl leading-none text-ink">{t.price}</p>
                  {t.suffix && <p className="mt-2 text-[0.8125rem] text-faint">{t.suffix}</p>}

                  <p className="mt-6 text-[0.9375rem] leading-relaxed text-muted">{t.note}</p>

                  <hr className="rule my-8" />

                  <ul className="flex-1 space-y-3.5 text-[0.9375rem] text-ink">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <span className="mt-3 h-px w-3 shrink-0 bg-brass" aria-hidden="true" />
                        <span className="leading-relaxed">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {t.comingSoon ? (
                    // Not a link on purpose: a concierge tier with nobody on
                    // the other end is a promise we cannot keep yet.
                    <span
                      aria-disabled="true"
                      className="btn btn-ghost mt-10 w-full cursor-default opacity-60"
                    >
                      {t.cta}
                    </span>
                  ) : (
                    <Link
                      href="/signup"
                      className={`btn mt-10 w-full ${t.featured ? "btn-primary" : "btn-ghost"}`}
                    >
                      {t.cta}
                    </Link>
                  )}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Questions ──────────────────────────────────────── */}
        <section id="faq" className="section">
          <div className="container-x grid gap-14 lg:grid-cols-[22rem_1fr] lg:gap-20">
            <Reveal>
              <p className="smallcaps">Questions</p>
              <h2 className="display-2 mt-5 text-ink">Ones you would rather not ask aloud.</h2>
            </Reveal>

            <Reveal delay={0.1} className="border-t border-line">
              {[
                {
                  q: "Isn't having this done for you rather cold?",
                  a: "You chose her, the dates, the gifts, the addresses and the hours — a year in advance. That is a great deal more forethought than most grand gestures contain. We simply do the clerical part.",
                },
                {
                  q: "What if she finds out?",
                  a: "A number of our members show her on purpose. “I sat down in March and planned our entire year” holds up remarkably well as a boast.",
                },
                {
                  q: "What if the date falls on a weekend and I have chosen her office?",
                  a: "We move it to the Friday before and tell you that we have. Nobody's flowers sit at an empty reception desk until Monday.",
                },
                {
                  q: "And if something cannot be delivered?",
                  a: "You hear from us at once — days ahead, not afterwards — with a replacement already held and a single confirmation required from you.",
                },
                {
                  q: "May I change something after it is set?",
                  a: "At any point before the order is placed, which is always several days ahead of the delivery. After that we can usually still intervene.",
                },
                {
                  q: "Does this work for anyone other than a wife?",
                  a: "Mothers, sisters, business partners, and the assistant who quietly runs your life. Add as many people and dates as you wish.",
                },
              ].map((f) => (
                <details key={f.q} className="group border-b border-line">
                  <summary className="flex cursor-pointer list-none items-baseline justify-between gap-8 py-7">
                    <span className="serif text-[1.2rem] leading-snug text-ink">{f.q}</span>
                    <span
                      className="shrink-0 text-brass transition-transform duration-300 group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-8 text-[1.0625rem] leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Closing ────────────────────────────────────────── */}
        <section className="border-t border-line bg-bone-2">
          <Reveal className="container-tight py-28 text-center md:py-36">
            <div className="flex justify-center">
              <SealMark className="drift h-14 w-14 text-brass" />
            </div>
            <p className="smallcaps mt-8">Twenty minutes, once</p>
            <hr className="rule-brass mx-auto mt-6" />
            <h2 className="display-1 mt-10 text-ink">
              Be the man who
              <br />
              <em className="italic text-forest">remembered.</em>
            </h2>
            <p className="lede mx-auto mt-9">
              Without, at any point in the next twelve months, having to remember.
            </p>
            <Link href="/signup" className="btn btn-primary btn-lg mt-12">
              Open an account
            </Link>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
