const fs = require('fs');
const csv = require('csv-parser');
const tf = require('@tensorflow/tfjs-node-gpu');
const natural = require('natural');
const path = require('path');

const tokenizer = new natural.WordTokenizer();

/* debugging */
function arrayDims(arr) {
    if (!Array.isArray(arr)) {
        return 0; // If the input is not an array, it has 0 dimensions
    }

    // If the array is empty, it has 1 dimension
    if (arr.length === 0) {
        return 1;
    }

    // Otherwise, find the maximum depth of nested arrays
    let maxDepth = 0;
    for (let i = 0; i < arr.length; i++) {
        const depth = arrayDims(arr[i]);
        if (depth > maxDepth) {
            maxDepth = depth;
        }
    }

    return maxDepth + 1; // Add 1 to account for the current level of nesting
}

// load csv files
async function readCSV(filePath) {
    const data = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', () => {
                resolve(data);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}


async function createVocab() {
    const practiceCSV = await readCSV('Data/Training/practiceInfo.csv');
    const setCSV = await readCSV('Data/Training/setInfo.csv');
    const exerciseCSV = await readCSV('Data/Training/exerciseInfo.csv');

    const corpus = practiceCSV.map(practice => practice.title.toLowerCase())
        .concat(setCSV.map(set => set.title.toLowerCase()))
        .concat(setCSV.map(set => set.rounds))
        .concat(exerciseCSV.map(exercise => exercise.reps))
        .concat(exerciseCSV.map(exercise => exercise.distance))
        .concat(exerciseCSV.map(exercise => exercise.energy.toLowerCase()))
        .concat(exerciseCSV.map(exercise => exercise.type.toLowerCase()))
        .concat(exerciseCSV.map(exercise => exercise.stroke.toLowerCase()))

    const vocab = new Set();
    
    vocab.add("NULL");

    vocab.add("PRACTICETITLE");
    vocab.add("SETTITLE");
    vocab.add("SETROUNDS");

    vocab.add("EXERCISEREPS");
    vocab.add("EXERCISEDISTANCE");
    vocab.add("EXERCISEENERGY");
    vocab.add("EXERCISETYPE");
    vocab.add("EXERCISESTROKE");
    
    vocab.add("STOP");

    corpus.forEach(text => {
        const tokens = tokenizer.tokenize(text);
        tokens.forEach(token => vocab.add(token));
    });

    // Convert the Set to an array and map each token to its index
    const tokenIndexMap = Array.from(vocab).map((key, value) => ({ key, value }));
    // Save the tokenIndexMap to a file
    fs.writeFileSync(path.join('./Models/V4-PreMassData/', 'vocab.json'), JSON.stringify(tokenIndexMap, null, 2));

    return vocab;
}

// assign each unique token with its integer representation
function encode(text, vocab, textLabel) {
    const tokens = tokenizer.tokenize(text.toLowerCase());

    // Initialize an array to hold the encoded integers for each token, plus initialize the start token
    let tokenizedText = [];
    tokenizedText.push(Array.from(vocab).indexOf(textLabel));

    // remap tokens as integer representations
    tokens.forEach(token => {
        const value = Array.from(vocab).indexOf(token);
        if (value !== -1) {
            tokenizedText.push(value);
        }
    });

    // Return the array of encoded integers
    return tokenizedText;
}

// pad titles
async function pad(arr, vocab) {
    // Step 1: Find the length of the longest inner array
    const maxLength = Math.max(...arr.map(item => item.length));

    // Step 2: Pad each inner array with zeros at the beginning to match the length of the longest inner array
    const paddedArray = arr.map(item => {
        // Calculate how many zeros need to be added at the beginning
        const paddingLength = maxLength - item.length;
        // Create an array filled with zeros of the required length
        const padding = new Array(paddingLength).fill(0);
        // Concatenate the padding array with the original title array
        const paddedItem = padding.concat(item);

        return paddedItem;
    });

    return paddedArray;
}

// MAIN

async function createModel() {

    /* < FEATURES & LABELS > */
    
    const vocab = await createVocab();

    const practiceCSV = await readCSV('Data/Training/practiceInfo.csv');
    const setCSV = await readCSV('Data/Training/setInfo.csv');
    const exerciseCSV = await readCSV('Data/Training/exerciseInfo.csv');

    // TURN CSV DATA INTO LIST OF PRACTICES

    // group exercises by setID
    const setIDGrouped = setCSV.map(setInfo => ({
        ...setInfo,
        exercises: exerciseCSV.filter(exerciseInfo => exerciseInfo.setID === setInfo.setID)
    }));

    // group sets by practiceID
    const practiceIDGrouped = practiceCSV.map(practiceInfo => ({
        ...practiceInfo,
        sets: setIDGrouped.filter(setInfo => setInfo.practiceID === practiceInfo.practiceID)
    }));
    
    console.log(practiceIDGrouped)
    
    // convert into array of encoded practices
    const encodedDataArray = practiceIDGrouped.map(practiceInfo => {
        let encodedDataArray = [];

        let encodedPracticeTitle = encode(practiceInfo.title, vocab, "PRACTICETITLE");
        encodedDataArray.push(encodedPracticeTitle);

        practiceInfo.sets.forEach(setInfo => {
            let encodedSetTitle = encode(setInfo.title, vocab, "SETTITLE");
            encodedDataArray.push(encodedSetTitle);

            let encodedSetRounds = encode(setInfo.rounds, vocab, "SETROUNDS");
            encodedDataArray.push(encodedSetRounds);

            setInfo.exercises.forEach(exerciseInfo => {
                let encodedExerciseReps = encode(exerciseInfo.reps, vocab, "EXERCISEREPS");
                encodedDataArray.push(encodedExerciseReps);

                let encodedExerciseDistance = encode(exerciseInfo.distance, vocab, "EXERCISEDISTANCE");
                encodedDataArray.push(encodedExerciseDistance);

                let encodedExerciseEnergy = encode(exerciseInfo.energy, vocab, "EXERCISEENERGY");
                encodedDataArray.push(encodedExerciseEnergy);

                let encodedExerciseType = encode(exerciseInfo.type, vocab, "EXERCISETYPE");
                encodedDataArray.push(encodedExerciseType);

                let encodedExerciseStroke = encode(exerciseInfo.stroke, vocab, "EXERCISESTROKE");
                encodedDataArray.push(encodedExerciseStroke);
            });
        });

        let encodedStopToken = Array.from(vocab).indexOf("STOP");
        encodedDataArray.push(encodedStopToken);

        return encodedDataArray.flat();
    });

    // create ngrams
    let nGrams = [];
    for (let i = 0; i < encodedDataArray.length; i++) {
        for (let j = 1; j < encodedDataArray[i].length; j++) {
            nGrams.push(encodedDataArray[i].slice(0, j + 1));
        }
    }

    const features = await pad(nGrams.map(nGram => nGram.slice(0,-1)), vocab);

    // take the last element of every ngram
    const labelIntegers = nGrams.map(nGram => nGram.slice(-1)).flat();
    // one hot encode the integers to represent probability distributions
    const labels = labelIntegers.map(labelValue => {
        let probabilityDistribution = new Array(vocab.size).fill(0);
        probabilityDistribution[labelValue] = 1;
        return probabilityDistribution;
    });

    const maxXLength = Math.max(...features.map(feature => feature.length));

    // save maxXLength
    fs.writeFileSync(path.join(__dirname, 'Models/V4-PreMassData/maxXLength.json'), JSON.stringify({ maxXLength }));

    // Convert X and Y to tensors
    const XTensor = tf.tensor2d(features);
    const YTensor = tf.tensor2d(labels);


    /* < MODEL > */

    // Define hyperparameters
    const embeddingDim = 128;
    const lstmUnits = 128;

    // construct model architecture
    const model = tf.sequential();
    model.add(tf.layers.embedding({inputDim: vocab.size, 
                                   outputDim: embeddingDim, 
                                   inputLength: maxXLength}));
    model.add(tf.layers.lstm({units: lstmUnits}));
    model.add(tf.layers.dropout({rate: 0.1}));
    model.add(tf.layers.dense({units: vocab.size, activation: 'softmax'}));

    // Compile
    model.compile({optimizer: 'adam', loss: 'categoricalCrossentropy'});
    model.summary();

    // early stoping
    const earlyStoppingCallback = tf.callbacks.earlyStopping({
        monitor: 'val_loss',
        patience: 1, // Stop training if there's no improvement in validation loss for n epochs
        minDelta: 0.001, // Consider an improvement if the validation loss decreases by at least n
       });


    /* < TRAIN & SAVE > */

    // Train the model
    try {
        await model.fit(XTensor, YTensor, {
            epochs: 500,
            batchSize: 1,
            validationSplit: 0.2,
            callbacks: [earlyStoppingCallback]
        });
    } catch (error) {
        console.error('There was a problem training the model:', error);
    }

    // Save the model
    try {
        await model.save('file://./Models/V4-PreMassData');
    } catch (error) {
        console.error('There was a problem saving the model:', error);
    }
    
}

// Call the asynchronous function to start the execution
createModel().catch(console.error);
