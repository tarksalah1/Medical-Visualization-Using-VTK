import  React  from "react"
// Force DataAccessHelper to have access to various data source
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import { vec3, quat, mat4 } from 'gl-matrix';



// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Glyph';

import vtkImageMarchingCubes from '@kitware//vtk.js/Filters/General/ImageMarchingCubes';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkHttpDataSetReader from '@kitware/vtk.js/IO/Core/HttpDataSetReader';
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
// Force the loading of HttpDataAccessHelper to support gzip decompression
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';





function App() {


    const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        background: [0, 0, 0],
    });
    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();
    const apiRenderWindow = fullScreenRenderer.getApiSpecificRenderWindow();

    global.renderer = renderer;
    global.renderWindow = renderWindow;

    // ----------------------------------------------------------------------------
    // 2D overlay rendering
    // ----------------------------------------------------------------------------

    const overlaySize = 15;
    const overlayBorder = 2;
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.width = `${overlaySize}px`;
    overlay.style.height = `${overlaySize}px`;
    overlay.style.border = `solid ${overlayBorder}px red`;
    overlay.style.borderRadius = '50%';
    overlay.style.left = '-100px';
    overlay.style.pointerEvents = 'none';
    document.querySelector('body').appendChild(overlay);

    // ----------------------------------------------------------------------------
    // Widget manager
    // ----------------------------------------------------------------------------

    const widgetManager = vtkWidgetManager.newInstance();
    widgetManager.setRenderer(renderer);

    const widget = vtkImageCroppingWidget.newInstance();

    function widgetRegistration(e) {
        const action = e ? e.currentTarget.dataset.action : 'addWidget';
        const viewWidget = widgetManager[action](widget);
        if (viewWidget) {
            viewWidget.setDisplayCallback((coords) => {
                overlay.style.left = '-100px';
                if (coords) {
                    const [w, h] = apiRenderWindow.getSize();
                    overlay.style.left = `${Math.round(
                        (coords[0][0] / w) * window.innerWidth -
                        overlaySize * 0.5 -
                        overlayBorder
                    )}px`;
                    overlay.style.top = `${Math.round(
                        ((h - coords[0][1]) / h) * window.innerHeight -
                        overlaySize * 0.5 -
                        overlayBorder
                    )}px`;
                }
            });

            renderer.resetCamera();
            renderer.resetCameraClippingRange();
        }
        widgetManager.enablePicking();
        renderWindow.render();
    }

    // Initial widget register
   

    // ----------------------------------------------------------------------------
    // Volume rendering
    // ----------------------------------------------------------------------------

    const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });

    const actor = vtkVolume.newInstance();
    const mapper = vtkVolumeMapper.newInstance();
    mapper.setSampleDistance(1.1);
    actor.setMapper(mapper);

    // create color and opacity transfer functions
    const ctfun = vtkColorTransferFunction.newInstance();
    ctfun.addRGBPoint(0, 85 / 255.0, 0, 0);
    ctfun.addRGBPoint(95, 1.0, 1.0, 1.0);
    ctfun.addRGBPoint(225, 0.66, 0.66, 0.5);
    ctfun.addRGBPoint(255, 0.3, 1.0, 0.5);
    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(0.0, 0.0);
    ofun.addPoint(255.0, 1.0);
    actor.getProperty().setRGBTransferFunction(0, ctfun);
    actor.getProperty().setScalarOpacity(0, ofun);
    actor.getProperty().setScalarOpacityUnitDistance(0, 3.0);
    actor.getProperty().setInterpolationTypeToLinear();
    actor.getProperty().setUseGradientOpacity(0, true);
    actor.getProperty().setGradientOpacityMinimumValue(0, 2);
    actor.getProperty().setGradientOpacityMinimumOpacity(0, 0.0);
    actor.getProperty().setGradientOpacityMaximumValue(0, 20);
    actor.getProperty().setGradientOpacityMaximumOpacity(0, 1.0);
    actor.getProperty().setShade(true);
    actor.getProperty().setAmbient(0.2);
    actor.getProperty().setDiffuse(0.7);
    actor.getProperty().setSpecular(0.3);
    actor.getProperty().setSpecularPower(8.0);

    mapper.setInputConnection(reader.getOutputPort());

    // -----------------------------------------------------------
    // Get data
    // -----------------------------------------------------------

    function getCroppingPlanes(imageData, ijkPlanes) {
        const rotation = quat.create();
        mat4.getRotation(rotation, imageData.getIndexToWorld());

        const rotateVec = (vec) => {
            const out = [0, 0, 0];
            vec3.transformQuat(out, vec, rotation);
            return out;
        };

        const [iMin, iMax, jMin, jMax, kMin, kMax] = ijkPlanes;
        const origin = imageData.indexToWorld([iMin, jMin, kMin]);
        // opposite corner from origin
        const corner = imageData.indexToWorld([iMax, jMax, kMax]);
        return [
            // X min/max
            vtkPlane.newInstance({ normal: rotateVec([1, 0, 0]), origin }),
            vtkPlane.newInstance({ normal: rotateVec([-1, 0, 0]), origin: corner }),
            // Y min/max
            vtkPlane.newInstance({ normal: rotateVec([0, 1, 0]), origin }),
            vtkPlane.newInstance({ normal: rotateVec([0, -1, 0]), origin: corner }),
            // X min/max
            vtkPlane.newInstance({ normal: rotateVec([0, 0, 1]), origin }),
            vtkPlane.newInstance({ normal: rotateVec([0, 0, -1]), origin: corner }),
        ];
    }



    reader.setUrl(`https://kitware.github.io/vtk-js/data/volume/headsq.vti`, { loadData: true })





  
    function slicer() {
        widgetRegistration();
        const image = reader.getOutputData();

        // update crop widget
        widget.copyImageDataDescription(image);
        const cropState = widget.getWidgetState().getCroppingPlanes();
        cropState.onModified(() => {
            const planes = getCroppingPlanes(image, cropState.getPlanes());
            mapper.removeAllClippingPlanes();
            planes.forEach((plane) => {
                mapper.addClippingPlane(plane);
            });
            mapper.modified();
        });

        // add volume to renderer
        
        renderer.removeAllActors();
        renderer.addVolume(actor);
        renderer.resetCamera();
        renderer.resetCameraClippingRange();
        renderWindow.render();
    }



    /////////////////////////////////////////
    //marching//
    ////////////////////////////////////////

    const mapper_2 = vtkMapper.newInstance();
    const actor_2 = vtkActor.newInstance();
    actor_2.setMapper(mapper_2);
    const marchingCube = vtkImageMarchingCubes.newInstance({
        contourValue: 0.0,
        computeNormals: true,
        mergePoints: true,
    });

    mapper_2.setInputConnection(marchingCube.getOutputPort());

    function updateIsoValue(e) {
        console.log("hereS")
        const isoValue = Number(e.target.value);
        marchingCube.setContourValue(isoValue);
        renderWindow.render();
    }

    marchingCube.setInputConnection(reader.getOutputPort());
    renderer.getActiveCamera().set({ position: [0, 1, 0], viewUp: [0, 0, -1] });

    function marching_c() {
        const data = reader.getOutputData();
        const dataRange = data.getPointData().getScalars().getRange();
        const firstIsoValue = (dataRange[0] + dataRange[1]) / 3;

        console.log(dataRange)

        const el = document.querySelector('.isoValue');
        el.setAttribute('min', dataRange[0]);
        el.setAttribute('max', dataRange[1]);
        el.setAttribute('value', firstIsoValue);
        el.addEventListener('input', updateIsoValue);

        marchingCube.setContourValue(firstIsoValue);
        
        widgetManager.removeWidget(widget);
        renderer.removeActor(actor);
        renderer.addActor(actor_2);
        
        renderer.resetCamera();
        renderWindow.render();
    }

    return (

        <div className='body' style={{
            zIndex: "2", //so the gui wont cover the sliders up
            position: "absolute"

        }}>
            <div className='panel'>
                <p>Iso value: </p>
                <input
                    className='isoValue'
                    type="range"
                />
                <button className='load' onClick={marching_c}>Marching cubes</button>
                <button className='load' onClick={slicer}>Slicer</button>
            </div>


        </div>

    );
}

export default App;