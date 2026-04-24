const computeCosineSimilarity = (vec1, vec2) => {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) {
        return 0;
    }
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        magnitude1 += vec1[i] * vec1[i];
        magnitude2 += vec2[i] * vec2[i];
    }
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    if (magnitude1 === 0 || magnitude2 === 0) {
        return 0;
    }
    return dotProduct / (magnitude1 * magnitude2);
};

const groupFramesIntoScenes = (frames, similarityThreshold = 0.7, timeThreshold = 1.0) => {
    if (!frames || frames.length === 0) {
        return [];
    }
    const scenes = [];
    let currentScene = {
        startFrame: frames[0],
        endFrame: frames[0],
        frames: [frames[0]],
        averageConfidence: 1.0,
        confidences: [1.0],
    };

    for (let i = 1; i < frames.length; i++) {
        const currentFrame = frames[i];
        const prevFrame = frames[i - 1];
        const timeDiff = currentFrame.timestamp_seconds - prevFrame.timestamp_seconds;
        const embedding1 = prevFrame.embedding;
        const embedding2 = currentFrame.embedding;
        let similarity = 1.0;
        if (embedding1 && embedding2) {
            similarity = computeCosineSimilarity(embedding1, embedding2);
        }

        if (timeDiff <= timeThreshold && similarity >= similarityThreshold) {
            currentScene.frames.push(currentFrame);
            currentScene.endFrame = currentFrame;
            currentScene.confidences.push(similarity);
            currentScene.averageConfidence = currentScene.confidences.reduce((a, b) => a + b, 0) / currentScene.confidences.length;
        } else {
            scenes.push(currentScene);
            currentScene = {
                startFrame: currentFrame,
                endFrame: currentFrame,
                frames: [currentFrame],
                averageConfidence: 1.0,
                confidences: [1.0],
            };
        }
    }
    scenes.push(currentScene);
    return scenes.map(scene => ({
        startTimestamp: scene.startFrame.timestamp_seconds,
        endTimestamp: scene.endFrame.timestamp_seconds,
        frameCount: scene.frames.length,
        confidence: Math.max(...scene.confidences),
        averageConfidence: scene.averageConfidence,
        thumbnail: scene.startFrame.thumbnail_path,
        description: scene.startFrame.description,
    }));
};

const performSimilaritySearch = (queryEmbedding, frames, topK = 10, threshold = 0.6) => {
    if (!frames || frames.length === 0) {
        return [];
    }
    const similarities = frames.map(frame => ({
        ...frame,
        similarity: computeCosineSimilarity(queryEmbedding, frame.embedding),
    }));
    return similarities.filter(item => item.similarity >= threshold).sort((a, b) => b.similarity - a.similarity).slice(0, topK);
};

module.exports = { groupFramesIntoScenes, performSimilaritySearch, computeCosineSimilarity, };