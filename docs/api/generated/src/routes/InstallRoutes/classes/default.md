[__ngdpbase API v1.5.0__](../../../../README.md)

***

[ngdpbase API](../../../../README.md) / [src/routes/InstallRoutes](../README.md) / default

# Class: default

Defined in: [src/routes/InstallRoutes.ts:98](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/InstallRoutes.ts#L98)

InstallRoutes - Handles first-run installation routes

Provides routes for:

- GET /install - Display installation form
- POST /install - Process installation

Routes are only accessible when installation is required.

 InstallRoutes

## Constructors

### Constructor

> __new default__(`engine`): `InstallRoutes`

Defined in: [src/routes/InstallRoutes.ts:109](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/InstallRoutes.ts#L109)

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

Defined in: [src/routes/InstallRoutes.ts:297](https://github.com/jwilleke/ngdpbase/blob/b6a859c7c9297966de89735ea5e8f953df289ac1/src/routes/InstallRoutes.ts#L297)

Get the router instance

#### Returns

`Router`
