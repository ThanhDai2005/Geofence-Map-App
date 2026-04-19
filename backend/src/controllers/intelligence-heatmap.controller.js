const intelligenceHeatmapService = require('../services/intelligence-heatmap.service');

exports.getAdminHeatmap = async (req, res, next) => {
    try {
        const { start, end } = req.query;
        const rows = await intelligenceHeatmapService.getAdminHeatmap({ start, end });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};

exports.getOwnerHeatmap = async (req, res, next) => {
    try {
        const { poi_id: poi_idSnake, poiId, start, end } = req.query;
        const rows = await intelligenceHeatmapService.getOwnerHeatmap(String(req.user._id), {
            poi_id: poi_idSnake ?? poiId,
            start,
            end
        });
        res.status(200).json(rows);
    } catch (e) {
        next(e);
    }
};
