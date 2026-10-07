# Hello World Default Template Update

## What changed

- Every newly registered business account now receives `hello_world` automatically.
- Existing business accounts receive `hello_world` automatically the next time templates/dashboard data are loaded.
- The default template is stored as `APPROVED`, language `en_US`, category `UTILITY`, with zero variables.
- The implementation consolidates duplicate `hello_world` rows after Meta synchronization and re-points scheduled automations before removing a duplicate.
- The starter-template endpoint now restores `hello_world` instead of returning HTTP 410.
- Navin-specific Birthday template behavior remains unchanged.

## Result

A business owner no longer needs to manually create or seed Hello World before using it in an automation.
