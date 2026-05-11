import { configureStore } from '@reduxjs/toolkit'
import { trustidApi } from './trustidApi'

export const store = configureStore({
  reducer: {
    [trustidApi.reducerPath]: trustidApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(trustidApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
