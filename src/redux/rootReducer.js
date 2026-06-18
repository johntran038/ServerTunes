import { combineReducers } from '@reduxjs/toolkit';
import playlistReducer from './slices/playlistSlice';
import sessionReducer from './slices/sessionSlice';

const rootReducer = combineReducers({
    playlist: playlistReducer,
    session: sessionReducer,
});

export default rootReducer;
