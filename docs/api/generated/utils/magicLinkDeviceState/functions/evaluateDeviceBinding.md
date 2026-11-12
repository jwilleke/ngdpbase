[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/magicLinkDeviceState](../README.md) / evaluateDeviceBinding

# Function: evaluateDeviceBinding()

> __evaluateDeviceBinding__(`input`): [`DeviceBindingResult`](../interfaces/DeviceBindingResult.md)

Defined in: src/utils/magicLinkDeviceState.ts:122

Decide what the presented cookie says about the redeeming browser.

Never throws: this runs on the sign-in path, and an exception here would turn
a legitimate login into a 500.

## Parameters

### input

[`DeviceBindingInput`](../interfaces/DeviceBindingInput.md)

## Returns

[`DeviceBindingResult`](../interfaces/DeviceBindingResult.md)
