# =====================================================================
# cleanup.ps1 — removes stray files from the project root.
#
# Run from inside your project folder:
#     powershell -ExecutionPolicy Bypass -File cleanup.ps1
#
# It deletes ONLY known strays. Your src/, supabase/, docs/, public/ and
# your .env.local are never touched.
# =====================================================================

Write-Host "`nChecking for stray files..." -ForegroundColor Cyan

# Loose copies of files that live inside src/, docs/ or supabase/.
# Downloaded individually in earlier steps and dropped at the root, where
# they do nothing except confuse you and, in one case, break the build.
$strays = @(
    "middleware.ts",                    # RENAMED to src/proxy.ts. Next picks up a
    "middleware.js",                    # root middleware file and it will conflict.
    "proxy.ts",                         # belongs at src/proxy.ts
    "layout.tsx",                       # belongs at src/app/[locale]/layout.tsx
    "page.tsx",                         # belongs at src/app/[locale]/page.tsx
    "globals.css",                      # belongs at src/app/globals.css
    "session.ts",                       # belongs at src/lib/auth/session.ts
    "auth.ts",                          # belongs at src/actions/auth.ts
    "company-application.ts",           # belongs at src/actions/
    "review-application.ts",            # belongs at src/actions/
    "application-review-card.tsx",      # belongs at src/components/admin/
    "0008_supplier_applications.sql",   # belongs at supabase/migrations/
    "03_actor_boundaries.sql",          # belongs at supabase/tests/
    "ACCESS-CONTROL.md",                # belongs at docs/
    "GETTING-STARTED.md",               # belongs at docs/
    "VERIFICATION.md",                  # belongs at docs/
    "mnt-list.txt",                     # not part of the project
    "mnt-list"
)

$removed = 0
foreach ($file in $strays) {
    if (Test-Path -LiteralPath $file -PathType Leaf) {
        Remove-Item -LiteralPath $file -Force
        Write-Host "  removed  $file" -ForegroundColor Yellow
        $removed++
    }
}

# A stray "mnt" folder appears if a download was extracted with its full path.
if (Test-Path -LiteralPath "mnt" -PathType Container) {
    Remove-Item -LiteralPath "mnt" -Recurse -Force
    Write-Host "  removed  mnt\ (folder)" -ForegroundColor Yellow
    $removed++
}

# .env holds secrets and is not read by Next. .env.local is the real one.
if ((Test-Path -LiteralPath ".env" -PathType Leaf) -and (Test-Path -LiteralPath ".env.local" -PathType Leaf)) {
    Write-Host "`n  NOTE: you have both .env and .env.local." -ForegroundColor Magenta
    Write-Host "  Next.js reads .env.local. Check .env, move anything you need," -ForegroundColor Magenta
    Write-Host "  then delete it yourself — I won't delete a file that may hold your keys." -ForegroundColor Magenta
}

Write-Host "`nRemoved $removed stray file(s)." -ForegroundColor Green
Write-Host "`nWhat should be left at the root:" -ForegroundColor Cyan
@(".gitignore", ".env.example", ".env.local.example", "README.md", "docs", "next-env.d.ts",
  "next.config.ts", "package.json", "package-lock.json", "postcss.config.mjs",
  "public", "src", "supabase", "tsconfig.json", "vercel.json",
  "(.env.local — yours, never committed)",
  "(node_modules, .next — generated, never committed)") | ForEach-Object {
    Write-Host "  $_" -ForegroundColor Gray
}

Write-Host "`nNow run:  npm install  then  npm run dev`n" -ForegroundColor Cyan
