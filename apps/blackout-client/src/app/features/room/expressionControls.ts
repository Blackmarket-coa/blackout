export const getExpressionControlVisibility = (width: number) => ({
    hideStickerBtn: width < 500,
    hideGifBtn: width < 620,
});
