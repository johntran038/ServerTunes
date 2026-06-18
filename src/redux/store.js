import { configureStore } from '@reduxjs/toolkit';
import rootReducer from './rootReducer';
import { persistPlaylist } from './slices/playlistSlice';

const store = configureStore({
    reducer: rootReducer,
});

// Persist playlist items to localStorage whenever they change.
let lastItems = store.getState().playlist.items;
store.subscribe(() => {
    const { items } = store.getState().playlist;
    if (items !== lastItems) {
        lastItems = items;
        persistPlaylist(items);
    }
});

export default store;
