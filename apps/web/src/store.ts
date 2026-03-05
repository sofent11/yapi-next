import { combineReducers, configureStore } from '@reduxjs/toolkit';
import type { AnyAction, Reducer } from '@reduxjs/toolkit';
import { yapiApi } from './services/yapi-api';

type ReducerMap = Record<string, Reducer<any, AnyAction>>;

const staticReducers: ReducerMap = {
  [yapiApi.reducerPath]: yapiApi.reducer
};

function createReducerManager(initialReducers: ReducerMap, staticReducerKeys: Set<string>) {
  const reducers: ReducerMap = { ...initialReducers };
  let keysToRemove: string[] = [];
  let combinedReducer = combineReducers(reducers);

  return {
    reduce(state: ReturnType<typeof combinedReducer> | undefined, action: AnyAction) {
      if (keysToRemove.length > 0 && state) {
        const nextState = { ...state };
        keysToRemove.forEach(key => {
          delete (nextState as Record<string, unknown>)[key];
        });
        keysToRemove = [];
        return combinedReducer(nextState, action);
      }
      return combinedReducer(state, action);
    },
    add(key: string, reducer: Reducer<any, AnyAction>) {
      if (!key || typeof reducer !== 'function') return false;
      if (reducers[key]) {
        // eslint-disable-next-line no-console
        console.error(`[store] reducer key already exists: ${key}`);
        return false;
      }
      reducers[key] = reducer;
      combinedReducer = combineReducers(reducers);
      return true;
    },
    remove(key: string) {
      if (!key || !reducers[key]) return false;
      if (staticReducerKeys.has(key)) {
        // eslint-disable-next-line no-console
        console.error(`[store] static reducer key cannot be removed: ${key}`);
        return false;
      }
      delete reducers[key];
      keysToRemove.push(key);
      combinedReducer = combineReducers(reducers);
      return true;
    },
    getReducerMap() {
      return { ...reducers };
    }
  };
}

const staticReducerKeys = new Set(Object.keys(staticReducers));
const reducerManager = createReducerManager(staticReducers, staticReducerKeys);

export const store = configureStore({
  reducer: reducerManager.reduce as Reducer<any, AnyAction>,
  middleware: getDefaultMiddleware => (getDefaultMiddleware().concat(yapiApi.middleware as any) as any)
});

export function registerDynamicReducers(reducerModules: ReducerMap): string[] {
  const addedKeys: string[] = [];
  Object.keys(reducerModules).forEach(key => {
    const reducer = reducerModules[key];
    if (typeof reducer !== 'function') return;
    if (staticReducerKeys.has(key)) {
      // eslint-disable-next-line no-console
      console.error(`[store] refusing to override static reducer key: ${key}`);
      return;
    }
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

export function unregisterDynamicReducers(keys: string[]): string[] {
  const removedKeys: string[] = [];
  keys.forEach(key => {
    if (reducerManager.remove(key)) {
      removedKeys.push(key);
    }
  });
  if (removedKeys.length > 0) {
    store.replaceReducer(reducerManager.reduce);
  }
  return removedKeys;
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
