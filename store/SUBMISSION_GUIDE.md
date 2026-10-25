# Publishing Idol Squad to the App Store — step by step

Everything in this repo is ready up to the point where Apple's tools are
required. These steps need a **Mac with Xcode 16+** and an **Apple Developer
Program membership** ($99/year, https://developer.apple.com/programs/enroll/ —
approval can take 1–2 days, so start that first).

## 1. Get the project onto the Mac

```bash
git clone -b game/idol-squad --single-branch https://github.com/ronq-bot/handled.git idol-squad
cd idol-squad
npm install
npm run ios:sync      # builds the game and copies it into the Xcode project
npm run ios:open      # opens ios/App/App.xcodeproj in Xcode
```

(Try it first with `npm run dev` and open the printed URL in Safari's
responsive mode, or on your phone on the same Wi-Fi.)

## 2. Pick your bundle ID and team

1. In `capacitor.config.ts`, change `appId` from `com.idolsquad.brainrotdefense`
   to something you own, e.g. `com.yourname.idolsquad`. Run `npm run ios:sync`.
2. In Xcode: select the **App** target → **Signing & Capabilities** →
   tick *Automatically manage signing*, choose your **Team**, and make sure
   the **Bundle Identifier** matches the `appId`.
3. Under **General**, set *Version* `1.0` and *Build* `1`.

## 3. Test on a real iPhone

Plug in an iPhone (enable Developer Mode on it when asked), pick it in the
Xcode toolbar and press **Run ▶**. Check:

- sound plays after the first tap, haptics buzz when slicing,
- the game pauses when you leave the app,
- nothing is hidden behind the notch / Dynamic Island or home bar.

## 4. Create the app record

App Store Connect (https://appstoreconnect.apple.com) → **Apps → + → New App**:

- Platform iOS, Name **Idol Squad: Brainrot Defense** (if taken, try
  "Idol Squad: Monster Defense"), language English, your bundle ID,
  SKU anything (e.g. `idolsquad1`).

Fill in the fields from **`store/listing.md`** (subtitle, description,
keywords, category, age rating, App Privacy = *Data Not Collected*).

## 5. Host the privacy policy and support page

Apple needs public URLs for both. The easiest free options:

- **Netlify Drop** (https://app.netlify.com/drop): drag the `store` folder in,
  you get a URL like `https://something.netlify.app/privacy.html`.
- **GitHub Pages** from a public repo.

Before uploading, replace `SUPPORT_EMAIL` in `privacy.html` and
`support.html` with a real address you check.

## 6. Upload screenshots

Use the images in `store/screenshots/iphone-6.9/` and
`store/screenshots/ipad-13/` (regenerate with
`node scripts/make-screenshots.cjs` while `npm run dev` is running).

## 7. Archive and upload the build

In Xcode: set the run destination to **Any iOS Device (arm64)** →
**Product → Archive**. When the Organizer opens: **Distribute App →
App Store Connect → Upload**. After ~15 minutes the build appears under the
app's **TestFlight** tab.

Optional but recommended: add yourself (and friends/family) as TestFlight
testers and play it for a day.

## 8. Submit for review

On the version page, select the uploaded build, answer *No* to the
encryption question (already declared in `Info.plist`), and press
**Add for Review → Submit**. Reviews usually take 1–3 days.

## Common rejection reasons — and why this app should pass

| Guideline | Risk | Status |
|---|---|---|
| 4.2 Minimum functionality | Web wrapper apps with no real content | Full native-feeling game, offline, haptics |
| 5.2 Intellectual property | Using trademarked characters | All characters are original designs; no third-party names or art |
| 2.1 App completeness | Crashes / placeholder text | Replace `SUPPORT_EMAIL`; test on device first |
| 5.1.1 Privacy | Missing policy URL | `store/privacy.html` |

## Updating later

Change code → bump *Build* (and *Version* for a new release) in Xcode →
`npm run ios:sync` → Archive → Upload → submit the new version.
