import { createSlice } from '@reduxjs/toolkit';

export const advancedMockSlice = createSlice({
  name: 'advancedMock',
  initialState: {
    lastEditedInterfaceId: 0,
    draftByInterface: {} as Record<number, string>
  },
  reducers: {
    setDraft(state, action: { payload: { interfaceId: number; script: string } }) {
      state.lastEditedInterfaceId = action.payload.interfaceId;
      state.draftByInterface[action.payload.interfaceId] = action.payload.script;
    }
  }
});

export const { setDraft } = advancedMockSlice.actions;
export default advancedMockSlice.reducer;
