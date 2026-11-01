#!/usr/bin/env bash
if grep -rnE "ReadStories|IncrementStoryViews|ActivateStealthMode" src api; then
  echo "FAIL: view-registering call found"; exit 1
fi
echo "OK: no view-registering calls"
