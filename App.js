// Force DataAccessHelper to have access to various data source
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper';
import React from 'react'
import { vec3, quat, mat4 } from 'gl-matrix';

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

import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkPiecewiseGaussianWidget from '@kitware/vtk.js/Interaction/Widgets/PiecewiseGaussianWidget';
import vtkColorMaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';





function App() {

    const head = 'https://kitware.github.io/vtk-js/data/volume/headsq.vti'
    const chest = 'https://kitware.github.io/vtk-js/data/volume/LIDC2.vti'
    const rootContainer = document.querySelector(
        '.vtk-js-example-piecewise-gaussian-widget'
    );
    const containerStyle = rootContainer ? { height: '100%' } : null;

    const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        rootContainer,
        containerStyle,
        background: [0, 0, 0, 0],
    });
    const renderer = fullScreenRenderer.getRenderer();
    const renderWindow = fullScreenRenderer.getRenderWindow();
    const apiRenderWindow = fullScreenRenderer.getApiSpecificRenderWindow();
    renderWindow.getInteractor().setDesiredUpdateRate(15.0);
    global.renderer = renderer;
    global.renderWindow = renderWindow;
    const body = rootContainer || document.querySelector('body');

    ///////////////////////////////////////////
    /////////slicer and colortransfer////////
    /////////////////////////////////////////

    // Create Widget container
    const widgetContainer = document.createElement('div');
    const label = document.createElement('p');
    label.innerHTML = 'Double click to add a gaussian, right click to remove'
    widgetContainer.style.visibility = 'hidden';
    widgetContainer.style.position = 'absolute';
    widgetContainer.style.top = 'calc(550px + 1em)';
    widgetContainer.style.left = '1070px';
    widgetContainer.style.background = 'rgba(255, 255, 255, 0.3)';
    label.style.color = 'white';
    body.appendChild(widgetContainer);
    widgetContainer.appendChild(label);

    // Create Label for preset
    const labelContainer = document.createElement('div');
    labelContainer.style.position = 'absolute';
    labelContainer.style.visibility = 'hidden';
    labelContainer.style.top = '5px';
    labelContainer.style.left = '5px';
    labelContainer.style.width = '100%';
    labelContainer.style.color = 'white';
    labelContainer.style.textAlign = 'center';
    labelContainer.style.userSelect = 'none';
    labelContainer.style.cursor = 'pointer';
    body.appendChild(labelContainer);

    let presetIndex = 30;
    const globalDataRange = [0, 255];
    const lookupTable = vtkColorTransferFunction.newInstance();

    function changePreset(delta = 1) {
        presetIndex =
            (presetIndex + delta + vtkColorMaps.rgbPresetNames.length) %
            vtkColorMaps.rgbPresetNames.length;
        lookupTable.applyColorMap(
            vtkColorMaps.getPresetByName(vtkColorMaps.rgbPresetNames[presetIndex])
        );
        lookupTable.setMappingRange(...globalDataRange);
        lookupTable.updateRange();
        labelContainer.innerHTML = vtkColorMaps.rgbPresetNames[presetIndex];
    }

    let intervalID = null;
    function stopInterval() {
        if (intervalID !== null) {
            clearInterval(intervalID);
            intervalID = null;
        }
    }

    labelContainer.addEventListener('click', (event) => {
        if (event.pageX < 200) {
            stopInterval();
            changePreset(-1);
        } else {
            stopInterval();
            changePreset(1);
        }
    });

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



    const widget_2 = vtkPiecewiseGaussianWidget.newInstance({
        numberOfBins: 256,
        size: [400, 150],
    });
    widget_2.updateStyle({
        backgroundColor: 'rgba(255, 255, 255, 0.6)',
        histogramColor: 'rgba(100, 100, 100, 0.5)',
        strokeColor: 'rgb(0, 0, 0)',
        activeColor: 'rgb(255, 255, 255)',
        handleColor: 'rgb(50, 150, 50)',
        buttonDisableFillColor: 'rgba(255, 255, 255, 0.5)',
        buttonDisableStrokeColor: 'rgba(0, 0, 0, 0.5)',
        buttonStrokeColor: 'rgba(0, 0, 0, 1)',
        buttonFillColor: 'rgba(255, 255, 255, 1)',
        strokeWidth: 2,
        activeStrokeWidth: 3,
        buttonStrokeWidth: 1.5,
        handleWidth: 3,
        iconSize: 0, // Can be 0 if you want to remove buttons (dblClick for (+) / rightClick for (-))
        padding: 10,
    });

    fullScreenRenderer.setResizeCallback(({ width, height }) => {
        widget_2.setSize(Math.min(450, width - 10), 150);
    });

    const piecewiseFunction = vtkPiecewiseFunction.newInstance();

    const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });

    const actor = vtkVolume.newInstance();
    const mapper = vtkVolumeMapper.newInstance();
    mapper.setSampleDistance(1.1);
    actor.setMapper(mapper);

    renderer.getActiveCamera().set({ position: [0, 1, 0], viewUp: [0, 0, -1] });


    mapper.setInputConnection(reader.getOutputPort());



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


    ///////////////////////////////////
    /////////preload default//////////
    /////////////////////////////////
    reader.setUrl(head, { loadData: true }).then(() => {
        calculations();

    });


    function calculations() {
        const image = reader.getOutputData();
        const dataArray = image.getPointData().getScalars();
        const dataRange = dataArray.getRange();
        globalDataRange[0] = dataRange[0];
        globalDataRange[1] = dataRange[1];

        // Update Lookup table
        changePreset();


        widget_2.setDataArray(dataArray.getData());
        widget_2.applyOpacity(piecewiseFunction);

        widget_2.setColorTransferFunction(lookupTable);
        lookupTable.onModified(() => {
            widget_2.render();
            renderWindow.render();
        });

        // update crop widget
        widget.copyImageDataDescription(image);
        const cropState = widget.getWidgetState().getCroppingPlanes();

        cropState.onModified(() => {
            const planes = getCroppingPlanes(image, cropState.getPlanes());
            mapper.removeAllClippingPlanes();
            planes.forEach((plane) => {
                mapper.addClippingPlane(plane);
                renderWindow.render();
            });
            mapper.modified();
        });


        const firstIsoValue = (dataRange[0] + dataRange[1]) / 6;



        const el = document.querySelector('.isoValue');
        el.setAttribute('min', dataRange[0]);
        el.setAttribute('max', dataRange[1]);
        el.setAttribute('value', firstIsoValue);
        const value = (el.value - el.min) / (el.max - el.min) * 100
        el.style.background = 'linear-gradient(to right, #74525b 0%, #74525b ' + value + '%, #e7dee0 ' + value + '%, #e7dee0 100%)'
        el.addEventListener('input', updateIsoValue);
        marchingCube.setContourValue(firstIsoValue);

        const el1 = document.querySelector('.blendMode');
        el1.addEventListener('change', updateBlendMode);
        const scalarMinEl = document.querySelector('.scalarMin');
        scalarMinEl.addEventListener('input', updateScalarMin);
        const scalarMaxEl = document.querySelector('.scalarMax');
        scalarMaxEl.addEventListener('input', updateScalarMax);

    }
    
    /////////////////////////////////
    ///////toggle projection/////////  
    /////////////////////////////////


    let isParallel = false;

    function toggleParallel() {
        const button = document.querySelector('.text');
        isParallel = !isParallel;
        const camera = renderer.getActiveCamera();
        camera.setParallelProjection(isParallel);

        renderer.resetCamera();

        button.innerText = `(${isParallel ? 'on' : 'off'})`;

        renderWindow.render();
    }



    /////////////////////////////////
    //////////switch data///////////  
    ///////////////////////////////

    function switch_data() {
        console.log('here')
        
        const type = document.querySelector('#dropdown');
        const part = type.options[type.selectedIndex].value;
        console.log(part)
        if (part === 'Head') {
            reader.setUrl(head, { loadData: true }).then(() => {
                calculations();

            });
        }
        if (part === 'Chest') {
            reader.setUrl(chest, { loadData: true }).then(() => {
                calculations();

            });
        }

        


        mapper.removeAllClippingPlanes();
        widgetManager.removeWidget(widget);
        renderer.removeAllActors();
        renderer.removeAllVolumes();
        renderer.resetCamera();
        widgetManager.enablePicking();
        renderer.resetCameraClippingRange();
        renderWindow.render();

    }





    function updateFlag(e) {
        const value = !!e.target.checked;
        const name = e.currentTarget.dataset.name;
        widget.set({ [name]: value }); // can be called on either viewWidget or parentWidget

        widgetManager.enablePicking();
        renderWindow.render();
    }

    const elems = document.querySelectorAll('.flag');
    for (let i = 0; i < elems.length; i++) {
        elems[i].addEventListener('change', updateFlag);
    }


    ////////////////////////////
    /////////bendmode//////////
    //////////////////////////

    function updateBlendMode(event) {
        const blendMode = parseInt(event.target.value, 10);
        const ipScalarEls = document.querySelectorAll('.ipScalar');
      
        mapper.setBlendMode(blendMode);
        mapper.setIpScalarRange(0.0, 1.0);
      
        // if average or additive blend mode
        if (blendMode === 3 || blendMode === 4) {
          // Show scalar ui
          for (let i = 0; i < ipScalarEls.length; i += 1) {
            const el = ipScalarEls[i];
            el.style.display = 'table-row';
          }
        } else {
          // Hide scalar ui
          for (let i = 0; i < ipScalarEls.length; i += 1) {
            const el = ipScalarEls[i];
            el.style.display = 'none';
          }
        }
      
        renderWindow.render();
      }
      
      function updateScalarMin(event) {
        mapper.setIpScalarRange(event.target.value, mapper.getIpScalarRange()[1]);
        renderWindow.render();
      }
      
      function updateScalarMax(event) {
        mapper.setIpScalarRange(mapper.getIpScalarRange()[0], event.target.value);
        renderWindow.render();
      }
      

    /////////////////////////////////
    //////////crop widget///////////  
    ///////////////////////////////

    function slicer() {
        const controlPanel = document.querySelector('.controlPanel')
        const isopanel = document.querySelector('.isopanel')
        const blendpanel = document.querySelector('.blendmode')
        controlPanel.style.display = 'block'
        blendpanel.style.display = 'block'
        isopanel.style.display = 'none'
        renderWindow.render();
        labelContainer.style.visibility = 'visible';
        widgetContainer.style.visibility = 'visible';
        document.querySelector('.typing-demo').style.display = 'none'

        // add volume to renderer

        actor_2.setVisibility(false)
        renderer.addVolume(actor);
        actor.setVisibility(true)
        renderer.resetCameraClippingRange();
        renderer.resetCamera();

        widgetRegistration();
        renderWindow.render();
    }


    actor.getProperty().setRGBTransferFunction(0, lookupTable);
    actor.getProperty().setScalarOpacity(0, piecewiseFunction);
    actor.getProperty().setInterpolationTypeToFastLinear();

    widget_2.addGaussian(0.425, 0.5, 0.2, 0.3, 0.2);
    widget_2.addGaussian(0.75, 1, 0.3, 0, 0);

    widget_2.setContainer(widgetContainer);
    widget_2.bindMouseListeners();

    widget_2.onAnimation((start) => {
        if (start) {
            renderWindow.getInteractor().requestAnimation(widget_2);
        } else {
            renderWindow.getInteractor().cancelAnimation(widget_2);
        }
    });

    widget_2.onOpacityChange(() => {
        widget_2.applyOpacity(piecewiseFunction);
        if (!renderWindow.getInteractor().isAnimating()) {
            renderWindow.render();
        }
    });



    //////////////////////////////////////////
    /////////////marching cubes//////////////
    ////////////////////////////////////////


    //since other actor is a volumeactor
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
        const value = (this.value - this.min) / (this.max - this.min) * 100
        this.style.background = 'linear-gradient(to right, #74525b 0%, #74525b ' + value + '%, #e7dee0 ' + value + '%, #e7dee0 100%)'
        marchingCube.setContourValue(isoValue);
        renderWindow.render();
    }

    marchingCube.setInputConnection(reader.getOutputPort());


    function marching_c() {
        const controlPanel = document.querySelector('.controlPanel')
        const blendpanel = document.querySelector('.blendmode')
        controlPanel.style.display = 'none'
        blendpanel.style.display = 'none'
        const isopanel = document.querySelector('.isopanel')
        isopanel.style.display = 'block'
        widgetContainer.style.visibility = 'hidden';
        labelContainer.style.visibility = 'hidden';
        document.querySelector('.typing-demo').style.display = 'none'

        widgetManager.removeWidget(widget);
        actor.setVisibility(false)
        renderer.addActor(actor_2);
        actor_2.setVisibility(true)
        renderer.resetCamera();
        renderWindow.render();
    }

    return (
        

        <div className='body' style={{
            zIndex: "2", //so the gui wont cover the sliders up
            position: "absolute"

        }}>
            <p className='typing-demo'>choose a view mode....</p>

            <div className='panel'>
                <p className='title'>MedScape</p>
                <label className='data'>Pick a dataset: </label>
                <select id="dropdown" onClick={switch_data} >
                    <option value="Head">Head</option>
                    <option value="Chest">Chest</option>
                </select>
                <p>Projection mode: </p>
                <button className='btn' onClick={toggleParallel}>
                    <span>Parallel projection:</span><i className="text">(off)</i></button>
                <div className='isopanel' style={{ display: 'none' }}>
                    <p className='iso'>Iso value: </p>
                    <input
                        className='isoValue'
                        type="range"
                    />
                </div>
                <p>View modes: </p>
                <button className='btn' onClick={marching_c}><span>Marching cubes</span></button>
                <button className='btn ' onClick={slicer}><span>Crop widget</span></button>
                <div className='controlPanel' style={{ display: 'none' }}>
                    <p>Presets: </p>
                    <table className='cpanel' >
                        <tbody>
                            <tr>
                                <td>Pickable</td>
                                <td>
                                    <input className='flag' data-name="pickable" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>Visibility</td>
                                <td>
                                    <input className='flag' data-name="visibility" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>ContextVisibility</td>
                                <td>
                                    <input className='flag' data-name="contextVisibility" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>HandleVisibility</td>
                                <td>
                                    <input className='flag' data-name="handleVisibility" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>FaceHandlesEnabled</td>
                                <td>
                                    <input className='flag' data-name="faceHandlesEnabled" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>EdgeHandlesEnabled</td>
                                <td>
                                    <input className='flag' data-name="edgeHandlesEnabled" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>CornerHandlesEnabled</td>
                                <td>
                                    <input className='flag' data-name="cornerHandlesEnabled" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                        </tbody>
                    </table>

                </div>

                

            </div>
            

            <table className='blendmode'>
                <tbody>
                    <tr>
                        <td>Blend Mode</td>
                        <td>
                            <select className="blendMode">
                                <option value="0">Composite</option>
                                <option value="1">Maximum Intensity</option>
                                <option value="2">Minimum Intensity</option>
                                <option value="3">Average Intensity</option>
                                <option value="4">Additive Intensity</option>
                            </select>
                        </td>
                    </tr> 
                    <tr className="ipScalar" style={{ display: "none" }}>
                        <td>IP Scalar Min</td>
                        <td><input className="scalarMin" type="range" min="0" max="1"  step="0.01" /></td>
                    </tr>
                    <tr className="ipScalar" style={{ display: "none" }}>
                        <td>IP Scalar Max</td>
                        <td><input className="scalarMax" type="range" min="0" max="1"  step="0.01" /></td>
                    </tr>
                </tbody>
            </table>


        </div>



    );

}

export default App; 