# Idol Squad: Brainrot Defense — road to the App Store

Status of each step toward a publishable iOS build. The /loop picks the next
unchecked item each iteration.

## Core game
- [x] Engine: canvas scaling for every iPhone/iPad size, safe areas, input
- [x] Battle: 3 waves + boss per area, perspective field, stage barrier
- [x] Ammo belt swipe-to-slice (the ASMR mechanic), auto-feeder
- [x] 5 idol heroes with distinct weapons (rapid, rocket, laser, freeze, chain lightning)
- [x] 6 monsters + 3 bosses, 3 worlds (30 areas)
- [x] Level-up upgrade cards (skills / firepower / ammo pillars)
- [x] Home: area select, squad roster (unlock / level up / pick team), boosts shop
- [x] Survival mode (unlocks after area 5), daily gift, settings
- [x] Synthesized SFX + music, haptics hook
- [x] Balance pass across all 30 areas (automated sim, fast + casual player bots)
- [x] Polish: home screen layout on tall phones, belt look, more juice
- [x] Boss attack patterns (spawn minions / charge)
- [x] Star ratings per area (replay value)
- [x] Save mirrored to native storage so iOS can't purge progress
- [ ] (post-launch) Monster codex / collection screen
- [ ] (post-launch) Achievements via Game Center

## iOS packaging
- [x] Capacitor iOS project (bundle id, portrait lock, status bar hidden)
- [x] App icon (1024) + launch screen generated from game art
- [x] Haptics plugin wired, audio session handling on interruptions
- [x] Pause on background / resume

## App Store submission kit
- [x] Screenshots (6.9" + 13" iPad) captured from the game
- [x] Listing copy: name, subtitle, description, keywords
- [x] Privacy policy page (no data collected) + support page
- [x] Age rating answers, App Privacy "Data Not Collected"
- [x] Step-by-step submission guide (Xcode archive → TestFlight → review)

## Needs you (on a Mac)
- [ ] Apple Developer Program membership
- [ ] Set your bundle ID in `capacitor.config.ts`, replace `SUPPORT_EMAIL` in `store/*.html`
- [ ] Follow `store/SUBMISSION_GUIDE.md`: test on device → archive → TestFlight → submit
