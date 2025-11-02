Next steps:
1) Open: ~/GIT/tone_comparison_app
2) Ensure Flutter SDK is set in android/local.properties (Flutter does this automatically on first run)
3) Get packages:
   cd ~/GIT/tone_comparison_app/mobile_app && flutter pub get
4) Build & run:
   - APK (debug):   ~/GIT/tone_comparison_app/scripts/build_apk.sh --debug
   - APK (release): ~/GIT/tone_comparison_app/scripts/build_apk.sh --release --no-install --no-launch
   - AAB (release): ~/GIT/tone_comparison_app/scripts/build_aab.sh
5) Rename remaining identifiers as desired and set up release signing when ready