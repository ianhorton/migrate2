# Testing the Serverless to CDK Migration Tool

## Documentation

- **Quick Reference**: `QUICK_TESTING_GUIDE.md` - Common commands and quick checks
- **Detailed Guide**: `docs/STEP_BY_STEP_TESTING.md` - Complete step-by-step walkthrough
- **Test Scripts**: `test-*.sh` - Automated test scripts

## Quick Test (All Steps)

```bash
./test-all-steps.sh
```

This will:
1. Clean previous outputs
2. Build the migration tool
3. Run all 6 migration steps
4. Generate verification reports
5. Show summary results

## Test Individual Steps

```bash
./test-step-1.sh              # Test INITIAL_SCAN only
```

## Manual Step-by-Step Testing

```bash
# 1. Build the tool
npm run build

# 2. Run migration (dry-run)
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo \
  --dry-run

# 3. Inspect outputs
cat ../foo/lib/foo-stack.ts                          # Generated CDK code
cat ../foo/migration-comparison-report.json          # Comparison results
open ../foo/migration-comparison-report.html         # Visual report

# 4. Test CDK synthesis
cd ../foo
npm install
npx cdk synth
```

## Verify Results

### Check Generated Code Quality
```bash
# Should use L2 constructs (good)
grep "new s3.Bucket" ../foo/lib/foo-stack.ts

# Should NOT use L1 constructs (bad)
grep "new s3.CfnBucket" ../foo/lib/foo-stack.ts || echo "✅ No L1 constructs"

# Should use proper enums
grep -E "Runtime\.|BillingMode\.|Architecture\." ../foo/lib/foo-stack.ts
```

### Compare Templates
```bash
# Original Serverless (find the actual file)
TEMPLATE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
cat "$TEMPLATE" | jq '.Resources | keys'

# Generated CDK
cat ../foo/cdk.out/FooStack.template.json | \
  jq '.Resources | keys'
```

## Common Issues

### CDK Synthesis Fails
```bash
cd ../foo
npx cdk synth 2>&1 | head -50  # See detailed errors
```

### Comparison Shows Differences
```bash
cat ../foo/migration-comparison-report.json | jq '.differences'
```

### Missing Resources
```bash
# Check what was removed
TEMPLATE=$(ls ../sls-cdk-migration/.serverless/cloudformation-template-{update,create}-stack.json 2>/dev/null | head -1)
diff \
  <(cat "$TEMPLATE" | jq -r '.Resources | keys[]' | sort) \
  <(cat ../foo/cdk.out/FooStack.template.json | jq -r '.Resources | keys[]' | sort)
```

## Advanced Testing

### Test with Different Languages
```bash
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo-python \
  --language python \
  --dry-run
```

### Test with Different Stages
```bash
npm run migrate -- \
  --source ../sls-cdk-migration \
  --target ../foo \
  --stage prod \
  --dry-run
```

## Next Steps

After successful dry-run testing:

1. Review comparison report
2. Fix any critical differences
3. Test CDK synthesis
4. Deploy to a test environment (without `--dry-run`)

**⚠️ WARNING**: Only remove `--dry-run` when ready to deploy to AWS!

## Getting Help

- View detailed logs: `npm run migrate ... 2>&1 | tee migration.log`
- Check comparison report: `open ../foo/migration-comparison-report.html`
- See full documentation: `docs/STEP_BY_STEP_TESTING.md`
