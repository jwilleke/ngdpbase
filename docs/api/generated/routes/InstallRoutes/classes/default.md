[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [routes/InstallRoutes](../README.md) / default

# Class: default

Defined in: src/routes/InstallRoutes.ts:77

InstallRoutes - Handles first-run installation routes

Provides routes for:

- GET /install - Display installation form
- POST /install - Process installation

Routes are only accessible when installation is required.

 InstallRoutes

## Constructors

### Constructor

> __new default__(`engine`): `InstallRoutes`

Defined in: src/routes/InstallRoutes.ts:88

Creates a new InstallRoutes instance

#### Parameters

##### engine

[`WikiEngine`](../../../types/WikiEngine/interfaces/WikiEngine.md)

The wiki engine instance

#### Returns

`InstallRoutes`

## Methods

### getRouter()

> __getRouter__(): `Router`

Defined in: src/routes/InstallRoutes.ts:242

Get the router instance

#### Returns

`Router`
