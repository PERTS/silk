// qualtrics.js
//
// Original author: CAM 2014-07-23
// CURRENTLY TESTING JFE COMPATIBILITY
//
// Purpose: Javascript file to be included in Qualtrics. Designed to be easy
// for survey writers and editors.
//
// Example javascript to be put in head of a survey:
/*

<script src="//use.typekit.net/qnb2yzi.js"></script>
<script src="//www.perts.net/static/silk/js/qualtrics.js"></script>
<!-- Yosemite style -->
<script>
    // Specify what program and domain we're using.
    perts.domain('https://www.perts.net');  // required, adjust as needed
    perts.programAbbreviation('NP16S');  // only if using audio
    perts.getPdUrl = perts.getYosemitePdUrl;
</script>
<!-- Neptune style -->
<script>
    // Specify what program and domain we're using.
    perts.domain('https://www.perts.net');  // required, adjust as needed
    perts.programAbbreviation('NP16S');  // only if using audio
    perts.getPdUrl = perts.getNeptunePdUrl;
    // Neptune uses a MySQL table for pd, so tons of write contention could be
    // a problem. Only save data when necessary. There's a build-in retry up
    // to 3 attempts.
    perts.disableAutomaticPdSave = true;
</script>
<link href="//www.perts.net/static/silk/css/qualtrics.css" rel="stylesheet" />

*/
// Inlines several third-party libraries:
// * jquery 1.11.0
// * soundjs 0.6.2
// * swfobject flashplugin 2.2
//
// Requires third-party libraries in a separate script tag:
// * typekit
//
// API to be used by survey writers:
//
// perts.disableAutomaticPdSave - bool, if set to true, will not automatically
//     use the cross site gif to send progress data back to the platform. It
//     will only do so when calling perts.data(foo) as a setter.
//
// perts.programAbbreviation() - Call to set program abbrevation,
//     e.g. perts.programAbbreviation('NP15S'), before using API.
//
// perts.domain() - Call to set platform domain, e.g.
//     perts.domain('https://www.perts.net') before using API. No trailing
//     slash.
//
// perts.next() - go to next page, alias of
//     Qualtrics.SurveyEngine.navClick(event, 'NextButton');
//
// perts.previous() - go to previous page, alias of
//     Qualtrics.SurveyEngine.navClick(event, 'PreviousButton');
//
// perts.data() - embedded data getter/setter. Setting also writes via the
//     cross_site.gif
//     variableName - str, the name of the embedded data to get
//     value - str, optional, a new value to set
//
// perts.relabelNextButton()
//     label - str, the text to display on the button.
//
// perts.playAudioFile()
//     fileName - str, e.g. 'take_five.mp3', expected to be found in the
//         /programs/[programAbbreviation]/static/audio/ directory.
//     options - obj, optional, with properties:
//         playImmediately - bool, default true. If false, you can turn the
//             audio on with perts.audioOn()
//         createToggle - bool, default true. Create a little on/off switch to
//             turn the audio on and off.
//
// perts.audioOn() - plays the audio file named in playAudioFile() from the
//     beginning if not playing already.
//
// perts.audioOff() - stops the audio named in playAudioFile() if currently
//     playing.
//
// perts.disableAudioToggle() - self explanatory
//
// perts.enableAudioToggle() - self explanatory
//
// perts.temporarilyBlockNavigation() - running multiple times on the same page
//     should leave only the last call in effect. Note: this function must
//     always be run from inside an onLoad event handler. This is done for you
//     in questions-level JS. If using this in the header, wrap the call like
//     this:
//     Qualtrics.SurveyEngine.addOnload(function () { /* put call here */ });
//     message - str, e.g. "You can't continue because you haven't
//         answered all the questions."
//     seconds - int, num of seconds the block stays in place, after
//         which functionality returns to normal. Default 0.
//
// perts.removeNavigationBlock() - undoes above function.
//
// perts.makeNextButtonRedirectToPlatform() - should be used on the last page
//     of a survey. Sends users to the /done page of the platform AND also
//     submits the Qualtrics survey in the background.




////////    API    ////////




function PERTS_MODULE() {
    'use strict';

    // The PERTS module which will be exported.
    var p = {};

    // Private variables.
    var domain,
        programAbbreviation,
        nextButton,
        previousButton,
        blockedNextButton,
        blockedNavMessage,
        blockedNavTimeout,
        currentSoundInstance,  // will be filled by playAudioFile()
        audioEmbedCode,  // will be filled in by playAudioFile()
        DOMInitialized = false,
        debugText = '';

    // Qualtrics.SurveyEngine.addOnLoad does not run things in a predictable
    // order in IE 8. That means we can't initialize DOM references once
    // "higher" in the code (i.e. here in this module) and expect it to run
    // before "lower" invocations of addOnLoad(). My solution to this is to
    // call this initialization function in all places that rely on having
    // DOM references, so they are sure to have what they need, no matter
    // what order they run in.
    var initializeDOMReferences = function () {
        if (DOMInitialized) { return; }
        debugText += "\n initializeDOMReferences()";

        nextButton = $j('#NextButton');
        previousButton = $j('#PreviousButton');

        // We rely on the existence of the next button to detect if the page
        // is actually loaded. The previous button often doesn't exist.
        DOMInitialized = nextButton.length !== 0;
    };

    var initializeDOMVamp = function(callback) {
        initializeDOMReferences();
        if (DOMInitialized) {
            debugText += "\n DOM ready...";
            callback();
        } else {
            debugText += "\n DOM wasn't ready, waiting...";
            setTimeout(initializeDOMVamp, 100);
        }
    };

    // Must be run on page load, because it references the DOM.
    var initializeBlockedNavigation = function (callback) {
        debugText += "\n initializeBlockedNavigation()";

        if (blockedNextButton) {
            blockedNextButton.remove();
        }
        if (blockedNavMessage) {
            blockedNavMessage.remove();
        }

        initializeDOMVamp(function () {

            var buttonContainer = $j('#Buttons');

            // We'll play some games with vertical spacing that attempt to be
            // robust, but if there's not enough margin-bottom on the button
            // we'll run into problems. parseInt() strips the 'px'.
            var marginBottom = parseInt(nextButton.css('margin-bottom'), 10);
            if (marginBottom < 30) {
                throw new Error("Can't replace next button: not enough " +
                                "margin-bottom");
            }
            // The new button with its associated message div will require
            // 30 pixels of height. Size the remaining margin to fit.
            marginBottom = marginBottom - 30;

            // The only way to get rid of the original button that doesn't
            // cause more problems is to give it display: none. Removing it
            // from the DOM disrupts Qualtrics' internal ways of navigating,
            // like the empty respose navigation check.
            nextButton.hide();

            // Insert a new next button so we can put our own event handlers on
            // it. It's important to have the type NOT be "submit" b/c
            // Qualtrics uses the onsubmit event to save the page's responses.
            blockedNextButton = $j('<input class="perts-button blocked-next-button" type="button">')
                .css('margin-bottom', marginBottom + 'px')
                .appendTo(buttonContainer);
            // Copy certain attributes over from the original button.
            ['title', 'name', 'value'].forEach(function (attr) {
                blockedNextButton.attr(attr, nextButton.attr(attr));
            });

            // Create a node that will contain a warning message if the user
            // clicks the next button too fast.
            blockedNavMessage = $j('<div class="blocked-nav-message">')
                .css({'height': '20px',
                      'margin-bottom': '10px',
                      'text-align': 'center'})
                .appendTo(buttonContainer);

            callback();
        });
    };

    // Setter/getter for the domain on which this javascript file is being
    // hosted, and from which Qualtrics is loading it. Must be set within
    // qualtrics.
    p.domain = function (setValue) {
        if (setValue) {
            // Make sure the domain does not have a trailing slash.
            if (/\/$/.test(setValue)) {
                setValue = setValue.substring(0, setValue.length - 1);
            }
            domain = setValue;
        }
        if (typeof domain !== 'string') {
            p.console.error(
                "Domain of PERTS platform must be set via perts.domain(); " +
                "cannot load audio or use cross_site.gif."
            );
            return '';
        }
        return domain;
    };

    // Setter/getter. This must be set within qualtrics.
    p.programAbbreviation = function (setValue) {
        if (setValue) {
            programAbbreviation = setValue;
        }
        if (typeof programAbbreviation !== 'string') {
            p.console.error(
                "Abbreviation for the program must be set via " +
                "perts.programAbbreviation(); cannot load audio."
            );
            return '';
        }
        return programAbbreviation;
    };

    // Sigh..... browser sniffing.....
    // http://stackoverflow.com/questions/12606245/detect-if-browser-is-running-on-an-android-or-ios-device
    p.is = {
        WinXP: /Windows NT 5/i.test(navigator.userAgent),
        IE8: /MSIE 8/i.test(navigator.userAgent),
        Android: /Android/i.test(navigator.userAgent),
        BlackBerry: /BlackBerry/i.test(navigator.userAgent),
        iOS: /iPhone|iPad|iPod/i.test(navigator.userAgent),
        IEMobile: /IEMobile/i.test(navigator.userAgent)
    };

    p.isMobile = function () {
        if (window.debugMobileAudio) {
            return true;
        } else {
            return p.is.Android || p.is.BlackBerry || p.is.iOS || p.is.IEMobile;
        }
    };

    p.next = function () {
        p.pageTransition();

        // This could be the click event, but it's not necessary.
        var event;
        // Right now just a shortcut; allows for future extensibility.
        Qualtrics.SurveyEngine.navClick(event, 'NextButton');
    };

    p.previous = function () {
        p.pageTransition();

        // This could be the click event, but it's not necessary.
        var event;
        // Right now just a shortcut; allows for future extensibility.
        Qualtrics.SurveyEngine.navClick(event, 'PreviousButton');
    };

    // Change the text displayed on the next button.
    p.relabelNextButton = function (label) {
        debugText += "\n relabelNextButton()";

        initializeDOMReferences();

        nextButton.val(label);
        nextButton.attr('title', label);
        if (blockedNextButton) {
            blockedNextButton.val(label);
            blockedNextButton.attr('title', label);
        }
    };

    // Invisibly swap out the next button for a substitute button that
    // *doesn't* navigate. Instead, a click on the substitute shows a
    // warning message. The original button is replaced after a delay.
    p.temporarilyBlockNavigation = function (message, seconds) {
        debugText += "\n temporarilyBlockNavigation()";

        seconds = Number(seconds) || 0;

        initializeDOMVamp(function () {

            var marginBottom = parseInt(nextButton.css('margin-bottom'), 10);
            if (marginBottom === 0) {
                // JFE doesn't apply styles synchronously, so we may have to wait
                // a tick for the margins to exist.
                setTimeout(function () {
                    perts.temporarilyBlockNavigation(message, seconds);
                }, 100);
                return;
            }

            if (blockedNextButton) {
                // Then this function has been run before on this page. We need to
                // reset some things before moving forward.
                blockedNextButton.unbind('click');
                clearTimeout(blockedNavTimeout);
                // The existing blocked button may have a different label. We'll
                // regenerate it to make sure it's up to date.
                $j('.blocked-next-button').remove();
            }

            initializeBlockedNavigation(function () {

                // Explain to the user why clicking the next button isn't working.
                blockedNextButton.click(function () {
                    blockedNavMessage.html(message);

                    // Count how many times users click on the blocked button.
                    var count = Number(p.data('blocked_nav_count')) || 0;
                    p.data('blocked_nav_count', count + 1);
                });

                // After the temporary period of time has passed, put the
                // original button back in place.
                blockedNavTimeout = setTimeout(p.removeNavigationBlock,
                                               seconds * 1000);
            });
        });
    };

    p.removeNavigationBlock = function () {
        initializeBlockedNavigation(function () {
            blockedNextButton.hide();
            blockedNavMessage.hide();
            nextButton.show();
            clearTimeout(blockedNavTimeout);
        });
    };

    p.hideNextButton = function (seconds) {
        // It's a bad idea to hide the next button permanently, because if
        // misused, users will be stuck. To remind developers of this, you
        // must submit a number of seconds to hide it, after which it will
        // re-appear.
        if (seconds === undefined) {
            throw new Error("The perts.hideNextButton() funtion requires a " +
                            "number of seconds.");
        }

        // Also, doesn't play nice with blocked navigation. Just railroads it,
        // so you can't have it both ways.
        initializeDOMReferences();
        if (blockedNextButton) {
            blockedNextButton.hide();
        }
        nextButton.hide();
        setTimeout(function () { nextButton.show(); }, seconds * 1000);
    };

    p.makeNextButtonRedirectToPlatform = function (buttonText) {
        initializeDOMReferences();
        nextButton.hide();

        if (blockedNextButton) {
            blockedNextButton.unbind('click');
            clearTimeout(blockedNavTimeout);
            blockedNextButton.hide();
        }

        var url = p.domain() + '/done' +
            '?program=' + p.programAbbreviation() +
            '&user=' + p.data('user') +
            '&activity_ordinal=' + p.data('activity_ordinal');

        $j('<a target="_blank" class="perts-button" ' +
            'href="' + url + '">' + buttonText + '</a>')
            .appendTo('#Buttons')
            .click(function () {
                setTimeout(p.next, 2 * 1000);
                return true;
            });
    };

    // Getter/setter for qualtrics embedded data.
    p.data = function (varName, value) {
        // Provide clear explanation if expected data doesn't exist.
        var inputNode = $j('#' + varName).get(0);
        if (!inputNode) {
            throw new Error("Could not find embedded data: " + varName);
        }
        var input = $j(inputNode);
        // If value given, set. Allow setting to falsy values, like '' or null.
        if (value !== undefined) {
            // This is the canonical way to set embedded data via javascript.
            // It works, with the exception that it doesn't change the
            // corresponding <input> values without a page refresh (b/c
            // qualtrics inlines those values server side). We depend on these
            // values being up to date client side, so also manually change
            // the input value.
            Qualtrics.SurveyEngine.setEmbeddedData(varName, value);
            input.val(value);

            // Also request the platform cross_site.gif to communciate data
            // back. This is the canonical way of triggering writes to Neptune.
            var maxAttempts = 3;
            var numAttempts = 0;
            var url = p.getPdUrl(varName);
            var retry = function () {
                numAttempts += 1;
                if (numAttempts < maxAttempts) {
                    p.crossSiteGif(url, retry);
                } else {
                    p.console.error("Failed to write pd after maxAttempts.");
                }
            };
            p.crossSiteGif(url, retry);
        }

        // Either way, get.
        return input.val();
        // While there does appear to be a function called
        // Qualtrics.SurveyEngine.getEmbeddedData(), it doesn't appear to work!
    };

    p.crossSiteGif = function (url, errorCallback) {
        if (!url) {
            p.console.log("Blank url; perts.crossSiteGif() NOT sending pd.");
            return;
        }
        $j("<img/>")
            .on('error', errorCallback)
            .attr("src", url);
    };

    p.getAudioUrl = function (fileName) {
        return p.domain() + '/programs/' + p.programAbbreviation() +
            '/static/audio/' + fileName;
    };

    // Function to call on individual pages/questions that plays audio.
    p.playAudioFile = function (fileName, options) {
        // Documentation:
        // http://www.createjs.com/Docs/SoundJS/classes/Sound.html

        options = options || {};

        // Build a toggle so the user can turn the audio off? Assume yes.
        if (options.createToggle !== false) {
            createAudioToggle();
        }
        // Should the audio immediately start to play? Assume yes.
        if (options.playImmediately !== false) {
            options.playImmediately = true;
        }
        // Never play immediately if this is a mobile device.
        if (p.isMobile()) {
            options.playImmediately = false;
            // Disable the toggle while the audio file loads. We'll enable it
            // in the file load callback.
            p.disableAudioToggle();
        }

        // This function supports two ways of playing audio.
        // * Via SoundJS (part of CreateJS), which attempts to use a variety
        //   of techniques, and generally works the best.
        // * Via a Qualtrics-powered <embed> tag. This is used for browsers
        //   which perform poorly (or not at all) with the standard method:
        //   anything on Windows XP, and IE 8 on anything.

        // The <embed> tag is the method Qualtrics
        // uses if you insert media via their rich-text editor. Below is the
        // the html they use, with some customizations. It's set to auto start,
        // and CSS places it outside the viewport, so to start and stop play
        // all we need to do is use jQuery to append it to or remove it from
        // the page.
        audioEmbedCode = '<embed class="qmedia perts-audio-embed" ' +
            'flashvars="file=' + p.getAudioUrl(fileName) +
            '&amp;width=320&amp;height=20&amp;type=mp3&amp;autostart=true" ' +
            'height="22" pluginspage="http://adobe.com/flashplayer/" ' +
            'src="../WRQualtricsShared/Flash/flvplayer.swf" ' +
            'type="application/x-shockwave-flash" width="322" ' +
            'wmode="transparent">';

        // As long as this isn't IE 8 (which createjs doesn't support), try to
        // use createjs to set up the audio file.
        if (typeof createjs !== 'undefined') {
            createjs.FlashPlugin.swfPath = p.domain() + '/static/';
            createjs.Sound.registerPlugins([createjs.WebAudioPlugin,
                                            createjs.HTMLAudioPlugin,
                                            createjs.FlashPlugin]);
            // If the default audio format isn't supported, test for support of
            // these next. Files of the same name with these extensions must exist
            // if this search for alternative support is to work.
            createjs.Sound.alternateExtensions = ['m4a', 'mp4', 'mp3'];

            // Play the audio stored in #soundId as soon as the file loads.
            createjs.Sound.addEventListener('fileload', function handleLoad(event) {
                currentSoundInstance = createjs.Sound.createInstance('pertsAudioFile');
                if (options.playImmediately) {
                    currentSoundInstance.play();
                }
                if (p.isMobile()) {
                    // Now that the file is ready, let people toggle audio.
                    p.enableAudioToggle();
                }
            });

            // Register an audio file for loading and future playback in Sound.
            // This is automatically called when using PreloadJS. It is recommended
            // to register all sounds that need to be played back in order to
            // properly prepare and preload them. Sound does internal preloading
            // when required.
            // The audio will start as soon as the file is loaded if
            // playImmediately is true (see the 'fileLoad' handler above).
            createjs.Sound.registerSound({
                id: 'pertsAudioFile',
                src: p.getAudioUrl(fileName)
            });
        } else if (options.playImmediately) {
            // IE 8 or any browser on Windows XP won't use createjs (the
            // library doesn't support those environments), so we'll use the
            // embed tag, so no sound needs to be registerd. The audioOn()
            // method can handle both ways of playing audio.
            p.audioOn();
        }
    };

    p.audioOn = function () {
        // We always want to play an audio file from the beginning and have no
        // need to support pausing and resuming. We also want to avoid having
        // two instances playing over each other. So call audioOff() to clear
        // the stage before starting anew.
        p.audioOff();

        if (currentSoundInstance) {
            currentSoundInstance.play();
        } else {
            // If we're not set up to use SoundJS, (Win XP and IE 8), append
            // the <embed>, which will play immediately.
            $j(document.body).append(audioEmbedCode);
        }
    };

    p.audioOff = function () {
        if (currentSoundInstance) {
            currentSoundInstance.stop();
        }
        // Turn off any embedded audio, if it exists. The class used here is
        // unique to embed tags managed by this code.
        $j('.perts-audio-embed').remove();
    };

    var createAudioToggle = function () {
        $j('<div id="audio-toggle-wrapper">' +
               '<div id="audio-toggle"></div>' +
           '</div>').appendTo('#Header');
        $j('#audio-toggle').click(function () {
            if ($j(this).hasClass('disabled')) {
                return;
            }
            // On click, change 1) the toggle's visual state, 2) the embedded
            // data which persists from page to page and 3) the play state of
            // the audio file.
            if ($j(this).hasClass('on')) {
                $j(this).removeClass('on');
                p.data('audio', 'off');
                p.audioOff();
            } else {
                $j(this).addClass('on');
                p.data('audio', 'on');
                p.audioOn();
            }
        });

        // If the user has previously turned on audio, make sure the switch
        // indicates that. Unless this is a mobile device, in which case don't
        // bother turning it on for them, because it won't work (it has to be
        // part of a touch event, so they have to do it themselves).
        if (p.data('audio') === 'on' && !p.isMobile()) {
            $j('#audio-toggle').addClass('on');
        }
    };

    p.disableAudioToggle = function () {
        $j('#audio-toggle').addClass('disabled');
    };

    p.enableAudioToggle = function () {
        $j('#audio-toggle').removeClass('disabled');
    };

    p.pageTransition = function () {
        // Makes sure that any flash players are removed from the page.
        p.audioOff();

        // As long as this isn't IE 8 (which createjs doesn't support),
        // make sure any sounds registered with createjs are removed.
        if (typeof createjs !== 'undefined') {
            createjs.Sound.removeAllSounds();
        }

        // Under JFE, the DOM is constantly being replaced from page to page,
        // but the javascript environment is unchanged. That means DOM node
        // references hang around, but their nodes are no longer relevant to
        // the current page. Fix this with a flag tell the module the DOM
        // references need refreshing, and by making sure important references
        // are cleared.
        DOMInitialized = false;
        blockedNextButton = undefined;
        blockedNavMessage = undefined;
    };

    // Must be set in survey head!
    p.getPdUrl = undefined;

    p.getYosemitePdUrl = function () {
        var embeddedData = ['variable', 'value', 'user', 'program',
                            'activity_ordinal'];
        var isPreview = false;
        var pairs = embeddedData.map(function (ed) {
            if (p.isPreview(ed)) {
                isPreview = true;
            }
            return ed + '=' + encodeURIComponent(perts.data(ed));
        });
        if (isPreview) {
            return '';
        } else {
            return perts.domain() + '/api/put/pd/cross_site.gif?' +
                pairs.join('&');
        }
    };

    p.getNeptunePdUrl = function (key) {
        var participantId = perts.data('participant_id');
        var surveyId = perts.data('survey_id');
        if (p.isPreview(key)) {
            return '';
        }
        return perts.domain() + '/api/participants/' + participantId +
            '/data/cross_site.gif?survey_id=' + surveyId + '&' +
            key + '=' + encodeURIComponent(perts.data(key));
    };

    p.isPreview = function (key) {
        // Don't load the url if the needed data hasn't been inlined. This
        // happens when previewing a question in Qualtrics.
        // We test for preview mode by looking for Qualtrics inlining code that
        // still remains at page load. Note that we can't test for the whole
        // thing using a string literal, or else the literal itself would get
        // replaced during inlining!
        var isPreview = p.data(key).indexOf('e://Field/') !== -1;
        if (isPreview) {
            p.console.log("PERTS detected preview data for " + key);
        }
        return isPreview;
    };

    // IE doesn't always have console.log, and, like the piece of fossilized
    // dinosaur dung that it is, will break when it encounters one. So put in a
    // version that 1) won't disrupt any other code's use of console, and
    // 2) won't break IE. Be sensitive both to the total lack of
    // window.console, and incomplete implementations of it.

    // Attempt to copy existing methods.
    if (window.console) {
        p.console = window.console;
    } else {
        p.console = {};
    }
    // For anything missing, fill in no-op functions.
    ['log', 'warn', 'error', 'debug'].forEach(function (method) {
        if (!window.console || !window.console[method]) {
            p.console[method] = function () {};
        }
    });

    p.stratify = function (userId, programId, name, proportions, attributes, successCallback, errorCallback) {
        var data = {
            user: userId,
            program: programId,
            name: name,
            proportions: JSON.stringify(proportions),
            attributes: JSON.stringify(attributes)
        };
        p.jsonp('api/stratify/jsonp', data, function (condition) {
            p.data('condition', condition);
            successCallback(condition);
        }, errorCallback);
    };

    p.jsonp = function (url, data, successCallback, errorCallback) {
        // This function handles requesting data from the PERTS Platform over
        // JSONP. It's designed to handle several failure cases gracefully:
        //
        // * Status 500 - the errorCallback function is called.
        // * Server catches an exception and returns JSON with condition
        //     '__ERROR__' - the errorCallback function is called.
        // * Server takes over 4 seconds to respond - the errorCallback is
        //     called
        //
        // In all of the above cases, the successCallback is NOT called.

        // We expect the url to start w/ a slash
        if (url.charAt(0) !== '/') {
            url = '/' + url;
        }
        var noop = function () {};
        errorCallback = errorCallback || noop;
        var timeoutCallback = errorCallback;
        var timeoutHandle;

        // AJAX
        $j.ajax({
            url: p.domain() + url,
            dataType: 'jsonp',
            //// You can customize the name of the callback here, but it's
            //// easier to let jQuery do it, because it adds magic debugging.
            // jsonpCallback:,
            data: data,
            error: function (jqxhr, status, error) {
                p.console.error("AJAX/JSONP error while stratifying:", status, error);
                errorCallback();
            },
            success: function (response) {
                if (response === '__ERROR__') {
                    errorCallback();
                } else {
                    successCallback(response);
                }
            },
            complete: function (jqxhr, status) {
                clearTimeout(timeoutHandle);
            }
        });

        // If the call takes too long, cancel any callbacks that might be
        // triggered by the ajax function in the future, and do something else
        // so the user isn't kept waiting.
        timeoutHandle = setTimeout(function () {
            successCallback = errorCallback = noop;
            timeoutCallback();
        }, 4000);
    };
    return p;
}

// JFE runs header code with every page transition, but it all happens in the
// same js environment/global scope. We don't want to re-instantiate our
// libraries over and over again.
if (!perts) {
    var perts = PERTS_MODULE();
}




////////    INITIALIZATION    ////////




// Load Typekit
try {
    Typekit.load({async: true});
} catch (ignore) {
    // do nothing with errors, we don't want to disrupt the user
}

// Apply mobile-specific styles.
if (perts.isMobile()) {
    $j('html').addClass('perts-mobile');
}

// Blocks backspace key except in the case of textareas and text inputs to
// prevent user navigation.
// http://stackoverflow.com/questions/1495219/how-can-i-prevent-the-backspace-key-from-navigating-back#answer-7895814
$j(document).keydown(function (e) {
    'use strict';
    var preventKeyPress;
    if (e.keyCode === 8) {
        var d = e.srcElement || e.target;
        switch (d.tagName.toUpperCase()) {
        case 'TEXTAREA':
            preventKeyPress = d.readOnly || d.disabled;
            break;
        case 'INPUT':
            preventKeyPress = d.readOnly || d.disabled ||
                (d.attributes.type && $j.inArray(d.attributes.type.value.toLowerCase(), ["radio", "checkbox", "submit", "button"]) >= 0);
            break;
        case 'DIV':
            preventKeyPress = d.readOnly || d.disabled || !(d.attributes.contentEditable && d.attributes.contentEditable.value === "true");
            break;
        default:
            preventKeyPress = true;
            break;
        }
    } else {
        preventKeyPress = false;
    }

    if (preventKeyPress) {
        e.preventDefault();
    }
});

Qualtrics.SurveyEngine.addOnload(function () {
    'use strict';

    // Connecting back button to the hidden "PreviousButton" IF there is one.
    // Sometimes Qualtrics doesn't provide a previous button because it would
    // mean going back over a branch. In that case, hide the back button.
    if ($j('#PreviousButton').length > 0) {
        $j('#BackButton').on('click', function () {
            perts.previous();
        });
    } else {
        $j('#BackButton').css('visibility', 'hidden');
    }

    $j('#PreviousButton, #NextButton').on(
        'click', perts.pageTransition);

    // Set up secret keystrokes to get around the various tricks that
    // might be blocking navigation.
    $j(document.body).keydown(function (event) {
        // Ctrl + y
        if (event.keyCode === 89 && event.ctrlKey === true) {
            perts.next();
        }
        // Ctrl + m
        if (event.keyCode === 77 && event.ctrlKey === true) {
            perts.previous();
        }
    });

    // Set up footer.
    var currentYear = (new Date()).getFullYear();
    $j('#Footer').html(
        '<!-- Set in qualtrics.js -->' +
        '<div class="foot-text">' +
            '&copy;' + currentYear + ' Stanford University. All Rights Reserved.' +
        '</div>'
    );

    if (perts.disableAutomaticPdSave) {
        // Notify developers that data sync has been skipped.
        perts.console.log(
            "Automatic saving has been DISABLED in this survey. Data is " +
            "NOT being sent back to the Platform unless explicitly saved " +
            "via perts.data().");
    } else {
        // Get the data embedded in the header and construct an image tag that
        // will send the data back to the server.
        if (!perts.getPdUrl) {
            throw new Error("perts.getPdUrl must be set in the head");
        }
        perts.crossSiteGif(perts.getPdUrl(), function errorCallback() {
            perts.console.error("Error saving pd.");
        });
    }
});
