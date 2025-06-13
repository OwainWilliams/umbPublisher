$Repo = "OwainWilliams/umbPublisher"  # Replace with your actual repository name
$ManifestFile = "manifest.json"
$JSFile = "main.js"

# Get latest release info
$ReleaseUrl = "https://api.github.com/repos/$Repo/releases/latest"
$Release = Invoke-RestMethod -Uri $ReleaseUrl

# Loop through assets and download the files
foreach ($Asset in $Release.assets) {
    if ($Asset.name -eq $ManifestFile -or $Asset.name -eq $JSFile) {
        $DownloadUrl = $Asset.browser_download_url
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $Asset.name
        Write-Host "Downloaded: $Asset.name"
    }
}