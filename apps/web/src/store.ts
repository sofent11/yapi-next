import { combineReducers, configureStore } from '@reduxjs/toolkit';
import type { AnyAction, Reducer } from '@reduxjs/toolkit';
import { yapiApi } from './services/yapi-api';

type ReducerMap = Record<string, Reducer<any, AnyAction>>;

const staticReducers: ReducerMap = {
  [yapiApi.reducerPath]: yapiApi.reducer
};

function createReducerManager(initialReducers: ReducerMap) {
  const reducers: ReducerMap = { ...initialReducers };
  let combinedReducer = combineReducers(reducers);

  return {
    reduce(state: ReturnType<typeof combinedReducer> | undefined, action: AnyAction) {
      return combinedReducer(state, action);
    },
    add(key: string, reducer: Reducer<any, AnyAction>) {
      if (!key || reducers[key] === reducer) return false;
      reducers[key] = reducer;
      combinedReducer = combineReducers(reducers);
      return true;
    },
    getReducerMap() {
      return { ...reducers };
    }
  };
}

const reducerManager = createReducerManager(staticReducers);

export const store = configureStore({
  reducer: reducerManager.reduce as Reducer<any, AnyAction>,
  middleware: getDefaultMiddleware => (getDefaultMiddleware().concat(yapiApi.middleware as any) as any)
});

export function registerDynamicReducers(reducerModules: ReducerMap): string[] {
  const addedKeys: string[] = [];
  Object.keys(reducerModules).forEach(key => {
    const reducer = reducerModules[key];
    if (typeof reducer !== 'function') return;
    const added = reducerManager.add(key, reducer);
    if (added) {
      addedKeys.push(key);
    }
  });
  if (addedKeys.length > 0) {
    store.replaceReducer(reducerManager.reduce);
  }
  return addedKeys;
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
