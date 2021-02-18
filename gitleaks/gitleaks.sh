#!/bin/bash

# Run gitleaks from any of our repositories with the following commands:
#    /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/PERTS/silk/HEAD/gitleaks/gitleaks.sh)\"

# You probably also want to add the following to your .gitignore file:
#    gitleaks*

# More about gitleaks: https://github.com/zricethezav/gitleaks

# Lines which have an error cause this whole script to exit with an error.
# http://stackoverflow.com/questions/3474526/stop-on-first-error
set -e

# Find gitleaks releases here: https://github.com/zricethezav/gitleaks/releases
export GITLEAKS_RELEASE="7.2.2"
export GITLEAKS_CMD="gitleaks-${GITLEAKS_RELEASE}"
export GITLEAKS_CONFIG="https://raw.githubusercontent.com/PERTS/silk/HEAD/gitleaks/gitleaks.toml"

# Binary for local/mac development environment
export GITLEAKS_BINARY="https://github.com/zricethezav/gitleaks/releases/download/v${GITLEAKS_RELEASE}/gitleaks-darwin-amd64"

if [ "$CI" = "true" ]; then
  echo "[gitleaks] Running in CI mode."

  # Override with Codeship/Docker binary
  export GITLEAKS_BINARY="https://github.com/zricethezav/gitleaks/releases/download/v${GITLEAKS_RELEASE}/gitleaks-linux-amd64"
fi

# Download the gitleaks binary if it hasn't already been downloaded.
if ! [ -f ./${GITLEAKS_CMD} ]; then
  echo "[gitleaks] Downloading gitleaks binary."
  curl -o ${GITLEAKS_CMD} -L ${GITLEAKS_BINARY}
  chmod +x ${GITLEAKS_CMD}
fi

# To ensure we're always using the latest gitleaks rules/config file, redownload
# the latest version from this repo.
echo "[gitleaks] Downloading gitleaks config."
curl -o gitleaks.toml -L ${GITLEAKS_CONFIG}

echo "[gitleaks] Scanning..."
./${GITLEAKS_CMD} --config-path=gitleaks.toml  --path=./ --no-git -v
