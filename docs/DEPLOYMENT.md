# Quick Deployment Guide for GitHub Pages

This guide shows you how to publish the Tone Matching Suite website to GitHub Pages.

## Prerequisites
- You have push access to the repository
- The website files are in the `website/` directory

## Option 1: Deploy from docs/ folder (Recommended)

This is the simplest method and keeps the website in the main branch.

### Steps:

1. **Copy website to docs/ folder** (if not already there):
   ```bash
   # From repository root
   mkdir -p docs
   cp -r website/* docs/
   git add docs/
   git commit -m "Add website to docs/ for GitHub Pages"
   git push
   ```

2. **Enable GitHub Pages**:
   - Go to your GitHub repository
   - Click **Settings** → **Pages** (in the left sidebar)
   - Under "Build and deployment":
     - Source: Select **"Deploy from a branch"**
     - Branch: Select **"main"** (or your default branch)
     - Folder: Select **"/docs"**
   - Click **Save**

3. **Wait for deployment** (usually 1-2 minutes)
   - GitHub will show a message: "Your site is live at https://rulingants.github.io/tone_comparison_app/"
   - Click the link to view your website

## Option 2: Deploy from gh-pages branch

This keeps the website separate from your main codebase.

### Steps:

1. **Create gh-pages branch**:
   ```bash
   # From repository root
   git checkout --orphan gh-pages
   git rm -rf .
   git clean -fdx
   ```

2. **Copy website files**:
   ```bash
   cp -r website/* .
   git add .
   git commit -m "Initial GitHub Pages deployment"
   git push origin gh-pages
   ```

3. **Enable GitHub Pages**:
   - Go to your GitHub repository
   - Click **Settings** → **Pages**
   - Under "Build and deployment":
     - Source: Select **"Deploy from a branch"**
     - Branch: Select **"gh-pages"**
     - Folder: Select **"/ (root)"**
   - Click **Save**

4. **Switch back to main branch**:
   ```bash
   git checkout main
   ```

## Updating the Website

### If using docs/ folder:
```bash
# Make changes in website/ directory
# Then copy to docs/
cp -r website/* docs/
git add docs/
git commit -m "Update website"
git push
```

### If using gh-pages branch:
```bash
git checkout gh-pages
# Make changes directly or copy from website/
git add .
git commit -m "Update website"
git push
git checkout main
```

## Adding Download Links

Before going live, update the download links in `downloads.html`:

1. **Create a GitHub Release**:
   - Go to your repository
   - Click "Releases" → "Create a new release"
   - Tag: `v1.0.0`
   - Title: `Tone Matching Suite v1.0.0`
   - Upload your installer files:
     - Tone Matching Bundler Setup 1.0.0.exe
     - Tone Matching Bundler-1.0.0-universal.dmg
     - Tone Matching Desktop Setup 1.0.0.exe
     - Tone Matching Desktop-1.0.0-universal.dmg
     - Tone Matching-1.0.0+1.apk
     - Tone Matching Comparison Setup 1.0.0.exe
     - Tone Matching Comparison-1.0.0-universal.dmg
   - Click "Publish release"

2. **Update download links**:
   - In `downloads.html` (or `docs/downloads.html`), replace `#download-note` with actual URLs
   - Format: `https://github.com/rulingAnts/tone_comparison_app/releases/download/v1.0.0/[filename]`
   - Example: `https://github.com/rulingAnts/tone_comparison_app/releases/download/v1.0.0/Tone-Matching-Bundler-Setup-1.0.0.exe`

## Adding Screenshots

Replace the placeholders in `website/images/` with actual screenshots:

1. Take screenshots of each application
2. Save with the following names:
   - `bundler-app-main.png`
   - `desktop-matching-tone-classification.png`
   - `mobile-app-tone-matching.png`
   - `mobile-app-tone-groups.png`
   - `comparison-app-results.png`
3. Update the HTML to use actual images instead of placeholders
4. Commit and push

## Custom Domain (Optional)

To use a custom domain like `tonematchingsuite.com`:

1. **Add CNAME file**:
   ```bash
   echo "tonematchingsuite.com" > docs/CNAME
   # or
   echo "tonematchingsuite.com" > CNAME  # if using gh-pages
   git add CNAME
   git commit -m "Add custom domain"
   git push
   ```

2. **Configure DNS**:
   - Add a CNAME record pointing to `rulingants.github.io`
   - Or add A records pointing to GitHub's IP addresses

3. **Update GitHub Pages settings**:
   - Settings → Pages → Custom domain
   - Enter your domain
   - Check "Enforce HTTPS"

## Troubleshooting

### "404 There isn't a GitHub Pages site here"
- Check that you've enabled GitHub Pages in Settings
- Verify the correct branch and folder are selected
- Wait a few minutes for deployment to complete

### "CSS not loading / Page looks unstyled"
- Check that `css/style.css` is in the correct location
- Verify file paths in HTML use relative paths
- Clear browser cache

### "Changes not showing up"
- GitHub Pages can take 1-2 minutes to rebuild
- Try hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
- Check GitHub Actions tab for build status

## Verification

After deployment, verify:
- [ ] Homepage loads correctly
- [ ] All navigation links work
- [ ] CSS styling is applied
- [ ] All subpages are accessible
- [ ] External links open in new tabs
- [ ] Mobile responsive design works
- [ ] Download links point to correct files (when added)

## Getting Help

If you encounter issues:
- Check [GitHub Pages documentation](https://docs.github.com/en/pages)
- Review commit history: `git log --oneline`
- Check GitHub Actions for build errors
- Ensure `.nojekyll` file is present (prevents Jekyll processing)

## Success!

Your website should now be live at:
- https://rulingants.github.io/tone_comparison_app/

Share this URL with field linguists and native speakers working on tone languages!
