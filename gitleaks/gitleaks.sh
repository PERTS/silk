#!/bin/bash
# Run gitleaks https://github.com/zricethezav/gitleaks

# Lines which have an error cause this whole script to exit with an error.
# http://stackoverflow.com/questions/3474526/stop-on-first-error
set -e

# Find gitleaks releases here: https://github.com/zricethezav/gitleaks/releases
export GITLEAKS_RELEASE="7.2.2"
export GITLEAKS_CMD="gitleaks-${GITLEAKS_RELEASE}"
export GITLEAKS_CONFIG="https://raw.githubusercontent.com/PERTS/silk/ttd-gitleaks/gitleaks/gitleaks.toml"

# Binary for local/mac development environment
export GITLEAKS_BINARY="https://github.com/zricethezav/gitleaks/releases/download/v${GITLEAKS_RELEASE}/gitleaks-darwin-amd64"

if [ "$CI" = "true" ]; then
  echo "[gitleaks] Running in CI mode."

  # Override with Codeship/Docker binary
  export GITLEAKS_BINARY="https://github.com/zricethezav/gitleaks/releases/download/v${GITLEAKS_RELEASE}/gitleaks-linux-amd64"
fi

if ! [ -f ./${GITLEAKS_CMD} ]; then
  echo "[gitleaks] Downloading gitleaks binary."
  curl -o ${GITLEAKS_CMD} -L ${GITLEAKS_BINARY}
  chmod +x ${GITLEAKS_CMD}
fi


echo "[gitleaks] Downloading gitleaks config."
curl -o gitleaks.toml -L ${GITLEAKS_CONFIG}

echo "[gitleaks] Scanning..."
./${GITLEAKS_CMD} --config-path=gitleaks.toml  --path=./ --no-git -v
