/**
 * Copyright (c) Microblink Ltd. All rights reserved.
 */

/**
 * This example app demonstrates how to use BlinkID ImageCapture In-browser SDK to achieve the following:
 *
 * - Change default SDK settings
 * - Scan front and back side of the identity document with web camera (combined experience)
 * - Provide visual feedback to the end-user during the scan
 * - Send document images to web API for processing
 */

// General UI helpers
const initialMessageEl = document.getElementById( "msg" );
const progressEl = document.getElementById( "load-progress" );

// UI elements for scanning feedback
const cameraFeed = document.getElementById( "camera-feed" );
const cameraFeedback = document.getElementById( "camera-feedback" );
const drawContext = cameraFeedback.getContext( "2d" );
const scanFeedback = document.getElementById( "camera-guides" );
let processingOnWebApi = false;

/**
 * Check browser support, customize settings and load WASM SDK.
 */
function main()
{
    // Check if browser has proper support for WebAssembly
    if ( !BlinkIDImageCaptureSDK.isBrowserSupported() )
    {
        initialMessageEl.innerText = "This browser is not supported!";
        return;
    }

    // 1. It's possible to obtain a free trial license key on microblink.com
    let licenseKey = "sRwAAAYJbG9jYWxob3N0r/lOPgo/w35CpGFWLIUTxcuCAoWyrw/hXqFhXCFPheJpGEl1rOJxd04GybaYWVZhEd2YAi2vy4j/nBPMUyIwH1f2tmwODVgEA42ErPfvMOzOm/appqwoQxciyCIkwVi55sT2hmu2v4qJlU/+NHhxDTGPaJiSIUP0X6HS+INl8Afl2h+Zl7s0wn4QHjJx8O7y1hs=";

    if ( window.location.hostname === "blinkid.github.io" )
    {
        licenseKey = "sRwAAAYRYmxpbmtpZC5naXRodWIuaW+qBF9heYYlTvZbvmaDiKtDv+XZv0f4pXoMJlSDkzDC87o8ov+Zn7XXpyM5A6Y7HyH2psXm4ew3rXY49SgFjxpvp/TX8+IgPPN+4PibhMhBpzZ1/K0cqUejQreB3harGuGjOf2kxzHgNC5M4Uv4kDJtTfBzgoaIQ1U6G98S5uu7PfrVJJ2IyMO4rm38CDPlRCGxbA==";
    }

    // 2. Create instance of SDK load settings with your license key
    const loadSettings = new BlinkIDImageCaptureSDK.WasmSDKLoadSettings( licenseKey );

    // [OPTIONAL] Change default settings

    // Show or hide hello message in browser console when WASM is successfully loaded
    loadSettings.allowHelloMessage = true;

    // In order to provide better UX, display progress bar while loading the SDK
    loadSettings.loadProgressCallback = ( progress ) => ( progressEl.value = progress );

    // Set absolute location of the engine, i.e. WASM and support JS files
    loadSettings.engineLocation = "https://unpkg.com/@microblink/blinkid-imagecapture-in-browser-sdk@5.9.0/resources/";

    // 3. Load SDK
    BlinkIDImageCaptureSDK.loadWasmModule( loadSettings ).then
    (
        ( sdk ) =>
        {
            document.getElementById( "screen-initial" )?.classList.add( "hidden" );
            document.getElementById( "screen-start" )?.classList.remove( "hidden" );
            document.getElementById( "start-scan" )?.addEventListener( "click", ( ev ) =>
            {
                ev.preventDefault();
                startScan( sdk );
            });
        },
        ( error ) =>
        {
            initialMessageEl.innerText = "Failed to load SDK!";
            console.error( "Failed to load SDK!", error );
        }
    );
}

/**
 * Scan single side of identity document with web camera.
 */
async function startScan( sdk )
{
    processingOnWebApi = false;

    document.getElementById( "screen-start" )?.classList.add( "hidden" );
    document.getElementById( "screen-scanning" )?.classList.remove( "hidden" );

    // 1. Create a recognizer objects which will be used to recognize single image or stream of images.
    //
    // BlinkID ImageCapture Recognizer - recognize a document and extract an image
    const blinkIdImageCaptureRecognizer = await BlinkIDImageCaptureSDK.createBlinkIdImageCaptureRecognizer( sdk );

    // 1.1. Enable scan of both sides for BlinkID ImageCapture recognizer
    const settings = await blinkIdImageCaptureRecognizer.currentSettings();

    settings[ "captureBothDocumentSides" ] = true;

    await blinkIdImageCaptureRecognizer.updateSettings( settings );

    // Create a callbacks object that will receive recognition events, such as detected object location etc.
    const callbacks = {
        onQuadDetection: ( quad ) => drawQuad( quad ),
        onDetectionFailed: () => updateScanFeedback( "Detection failed", true ),

        // This callback is required for combined experience.
        onFirstSideResult: () => alert( "Flip the document" )
    }

    // 2. Create a RecognizerRunner object which orchestrates the recognition with one or more
    //    recognizer objects.
    const recognizerRunner = await BlinkIDImageCaptureSDK.createRecognizerRunner
    (
        // SDK instance to use
        sdk,
        // List of recognizer objects that will be associated with created RecognizerRunner object
        [ blinkIdImageCaptureRecognizer ],
        // [OPTIONAL] Should recognition pipeline stop as soon as first recognizer in chain finished recognition
        false,
        // Callbacks object that will receive recognition events
        callbacks
    );

    // 3. Create a VideoRecognizer object and attach it to HTMLVideoElement that will be used for displaying the camera feed
    const videoRecognizer = await BlinkIDImageCaptureSDK.VideoRecognizer.createVideoRecognizerFromCameraStream
    (
        cameraFeed,
        recognizerRunner
    );

    // 4. Start the recognition and get results from callback
    try
    {
        videoRecognizer.startRecognition
        (
            // 5. Obtain the results
            async ( recognitionState ) =>
            {
                if ( !videoRecognizer )
                {
                    return;
                }

                // Pause recognition before performing any async operation
                videoRecognizer.pauseRecognition();

                if ( recognitionState === BlinkIDImageCaptureSDK.RecognizerResultState.Empty )
                {
                    return;
                }

                const blinkIdImageCaptureResults = await blinkIdImageCaptureRecognizer.getResult();

                if ( blinkIdImageCaptureResults.state !== BlinkIDImageCaptureSDK.RecognizerResultState.Empty )
                {
                    console.log( "BlinkIDImageCapture results", blinkIdImageCaptureResults );

                    if ( !blinkIdImageCaptureResults.frontSideCameraFrame )
                    {
                        alert( "Could not extract front image of a document. Please try again." );
                    }
                    else if ( !blinkIdImageCaptureResults.backSideCameraFrame )
                    {
                        alert( "Could not extract back image of a document. Please try again." );
                    }
                    else
                    {
                        processingOnWebApi = true;
                        updateScanFeedback( "Sending request to web API...", true );
                        getWebApiResults(
                            blinkIdImageCaptureResults.frontSideCameraFrame,
                            blinkIdImageCaptureResults.backSideCameraFrame
                        );
                    }
                }

                // 6. Release all resources allocated on the WebAssembly heap and associated with camera stream

                // Release browser resources associated with the camera stream
                videoRecognizer?.releaseVideoFeed();

                // Release memory on WebAssembly heap used by the RecognizerRunner
                recognizerRunner?.delete();

                // Release memory on WebAssembly heap used by the recognizer
                blinkIdImageCaptureRecognizer?.delete();

                // Clear any leftovers drawn to canvas
                clearDrawCanvas();

                // Hide scanning screen and show scan button again
                if ( !processingOnWebApi )
                {
                    document.getElementById( "screen-start" )?.classList.remove( "hidden" );
                    document.getElementById( "screen-scanning" )?.classList.add( "hidden" );
                }
            }
        );
    }
    catch ( error )
    {
        console.error( "Error during initialization of VideoRecognizer:", error );
        return;
    }
}

/**
 * Prepare and send image frames to web API for recognition processing.
 *
 * This function is using client library which is provided with the SDK.
 */
function getWebApiResults( frontSide, backSide )
{
    // Create instance of client library - for more information see `client-library/README.md` file
    const client = new Client.Client( Client.ApiType.SelfHosted, { apiLocation: "https://demoapi.microblink.com" } );

    // Send image to web API for processing
    const payload =
    {
        // Images from WASM library should be converted to Base64 from ImageData format.
        "imageFrontSide": client.imageDataToBase64( frontSide ),
        "imageBackSide": client.imageDataToBase64( backSide )
    };

    client.recognize( "/v1/recognizers/blinkid-combined", payload )
        .then( ( results ) =>
        {
            const recognitionResults = results.response.data.result;
            console.log( "API recognition results", recognitionResults );

            if ( recognitionResults.recognitionStatus === "EMPTY" )
            {
                console.warn( "API processing returned empty results." );
                alert( "API processing returned empty results." );
                return;
            }

            alert
            (
                `Hello, ${ recognitionResults.firstName } ${ recognitionResults.lastName }!\n` +
                `You were born on ${ recognitionResults.dateOfBirth.year }-${ recognitionResults.dateOfBirth.month }-${ recognitionResults.dateOfBirth.day }.`
            );
        } )
        .catch( ( error ) =>
        {
            console.error( "API recognition error", error );
            alert( "Could not process image on backend." );
        } )
        .finally( () =>
        {
            processingOnWebApi = false;
            document.getElementById( "screen-start" )?.classList.remove( "hidden" );
            document.getElementById( "screen-scanning" )?.classList.add( "hidden" );
        } );
}

/**
 * Utility functions for drawing detected quadrilateral onto canvas.
 */
function drawQuad( quad )
{
    clearDrawCanvas();

    // Based on detection status, show appropriate color and message
    setupColor( quad );
    setupMessage( quad );

    applyTransform( quad.transformMatrix );
    drawContext.beginPath();
    drawContext.moveTo( quad.topLeft    .x, quad.topLeft    .y );
    drawContext.lineTo( quad.topRight   .x, quad.topRight   .y );
    drawContext.lineTo( quad.bottomRight.x, quad.bottomRight.y );
    drawContext.lineTo( quad.bottomLeft .x, quad.bottomLeft .y );
    drawContext.closePath();
    drawContext.stroke();
}

/**
 * This function will make sure that coordinate system associated with detectionResult
 * canvas will match the coordinate system of the image being recognized.
 */
function applyTransform( transformMatrix )
{
    const canvasAR = cameraFeedback.width / cameraFeedback.height;
    const videoAR = cameraFeed.videoWidth / cameraFeed.videoHeight;

    let xOffset = 0;
    let yOffset = 0;
    let scaledVideoHeight = 0
    let scaledVideoWidth = 0

    if ( canvasAR > videoAR )
    {
        // pillarboxing: https://en.wikipedia.org/wiki/Pillarbox
        scaledVideoHeight = cameraFeedback.height;
        scaledVideoWidth = videoAR * scaledVideoHeight;
        xOffset = ( cameraFeedback.width - scaledVideoWidth ) / 2.0;
    }
    else
    {
        // letterboxing: https://en.wikipedia.org/wiki/Letterboxing_(filming)
        scaledVideoWidth = cameraFeedback.width;
        scaledVideoHeight = scaledVideoWidth / videoAR;
        yOffset = ( cameraFeedback.height - scaledVideoHeight ) / 2.0;
    }

    // first transform canvas for offset of video preview within the HTML video element (i.e. correct letterboxing or pillarboxing)
    drawContext.translate( xOffset, yOffset );
    // second, scale the canvas to fit the scaled video
    drawContext.scale
    (
        scaledVideoWidth / cameraFeed.videoWidth,
        scaledVideoHeight / cameraFeed.videoHeight
    );

    // finally, apply transformation from image coordinate system to
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/setTransform
    drawContext.transform
    (
        transformMatrix[0],
        transformMatrix[3],
        transformMatrix[1],
        transformMatrix[4],
        transformMatrix[2],
        transformMatrix[5]
    );
}

function clearDrawCanvas()
{
    cameraFeedback.width = cameraFeedback.clientWidth;
    cameraFeedback.height = cameraFeedback.clientHeight;

    drawContext.clearRect
    (
        0,
        0,
        cameraFeedback.width,
        cameraFeedback.height
    );
}

function setupColor( displayable )
{
    let color = "#FFFF00FF";

    if ( displayable.detectionStatus === 0 )
    {
        color = "#FF0000FF";
    }
    else if ( displayable.detectionStatus === 1 )
    {
        color = "#00FF00FF";
    }

    drawContext.fillStyle = color;
    drawContext.strokeStyle = color;
    drawContext.lineWidth = 5;
}

function setupMessage( displayable )
{
    switch ( displayable.detectionStatus )
    {
        case BlinkIDImageCaptureSDK.DetectionStatus.Fail:
            updateScanFeedback( "Scanning..." );
            break;
        case BlinkIDImageCaptureSDK.DetectionStatus.Success:
        case BlinkIDImageCaptureSDK.DetectionStatus.FallbackSuccess:
            updateScanFeedback( "Detection successful" );
            break;
        case BlinkIDImageCaptureSDK.DetectionStatus.CameraAtAngle:
            updateScanFeedback( "Adjust the angle" );
            break;
        case BlinkIDImageCaptureSDK.DetectionStatus.CameraTooHigh:
            updateScanFeedback( "Move document closer" );
            break;
        case BlinkIDImageCaptureSDK.DetectionStatus.CameraTooNear:
        case BlinkIDImageCaptureSDK.DetectionStatus.DocumentTooCloseToEdge:
        case BlinkIDImageCaptureSDK.DetectionStatus.Partial:
            updateScanFeedback( "Move document farther" );
            break;
        default:
            console.warn( "Unhandled detection status!", displayable.detectionStatus );
    }
}

let scanFeedbackLock = false;

/**
 * The purpose of this function is to ensure that scan feedback message is
 * visible for at least 1 second.
 */
function updateScanFeedback( message, force )
{
    if ( scanFeedbackLock && !force )
    {
        return;
    }

    scanFeedbackLock = true;
    scanFeedback.innerText = message;

    window.setTimeout( () => scanFeedbackLock = false, 1000 );
}

// Run
main();
