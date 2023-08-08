import { v4 as uuidv4 } from 'uuid';
import uniq from 'lodash/uniq';
import { ContentNodeKinds } from 'kolibri.coreVue.vuex.constants';
import {
  ContentNodeResource,
  BookmarksResource,
  ContentNodeSearchResource,
  ChannelResource,
} from 'kolibri.resources';
import { validateObject, objectWithDefaults } from 'kolibri.utils.objectSpecs';
import { get, set } from '@vueuse/core';
import { computed, ref, onMounted } from 'kolibri.lib.vueCompositionApi';
import { Exercise, Quiz, QuizQuestion, QuizSection } from './quizCreationSpecs.js';

/** Validators **/
/* objectSpecs expects every property to be available -- but we don't want to have to make an
 * object with every property just to validate it. So we use these functions to validate subsets
 * of the properties. */

function validateQuiz(quiz) {
  return validateObject(quiz, Quiz);
}

/*
 * Composable function presenting primary interface for Quiz Creation
 */
export function useQuizCreation() {
  // STATE

  /* @type {ref<Quiz>}
   * The "source of truth" quiz object from which all reactive properties should derive */
  const _quiz = ref(objectWithDefaults({}, Quiz));

  /* @type {ref<QuizSection>}
   * The section that is currently selected for editing */
  const _activeSectionId = ref(null);

  /* @type {ref<QuizQuestion[]>}
   * The questions that are currently selected for action in the active section */
  const _selectedQuestions = ref([]);

  // API / METHODS

  // ------------------
  // Section Management
  // ------------------

  /* @param   {QuizSection} section
   * @returns {QuizSection}
   * @affects _quiz - Updates the section with the given section_id with the given param
   * @throws {TypeError} if section is not a valid QuizSection */
  function updateSection({ section_id, ...updates }) {
    const targetSection = get(allSections).find(section => section.section_id === section_id);
    if (!targetSection) {
      throw new TypeError(`Section with id ${section_id} not found; cannot be updated.`);
    }
    set(_quiz, {
      ...get(quiz),
      // Update matching QuizSections with the updates object
      question_sources: get(allSections).map(section => {
        if (section.section_id === section_id) {
          return { ...section, ...updates };
        }
        return section;
      }),
    });
  }

  /* @param {QuizQuestion[]} newQuestions
   * @affects _quiz - Updates the active section's `questions` property
   * @affects _selectedQuestions - Clears this back to an empty array
   * @throws {TypeError} if newQuestions is not a valid array of QuizQuestions
   * Updates the active section's `questions` property with the given newQuestions, and clears
   * _selectedQuestions from it. Then it resets _selectedQuestions to an empty array */
  function replaceSelectedQuestions(newQuestions) {}

  /* @returns {QuizSection}
   * Adds a section to the quiz and returns it */
  function addSection() {
    const newSection = objectWithDefaults({ section_id: uuidv4() }, QuizSection);
    updateQuiz({ question_sources: [...get(quiz).question_sources, newSection] });
    return newSection;
  }

  /* @throws {Error} if section not found
   * Deletes the given section by section_id */
  function removeSection(section_id) {
    const updatedSections = get(allSections).filter(section => section.section_id !== section_id);
    if (updatedSections.length === get(allSections).length) {
      throw new Error(`Section with id ${section_id} not found; cannot be removed.`);
    }
    updateQuiz({ question_sources: updatedSections });
  }

  /* @param {string} [section_id]
   * @affects _activeSectionId
   * Sets the given section_id as the active section ID, however, if the ID is not found or is null
   * it will set the activeId to the first section in _quiz.question_sources */
  function setActiveSection(section_id = null) {
    set(_activeSectionId, section_id);
  }

  // ------------
  // Quiz General
  // ------------

  /* @affects _quiz
   * @affects _activeSectionId
   * @affects _channels - Calls _fetchChannels to bootstrap the list of needed channels
   * Adds a new section to the quiz and sets the activeSectionID to it, preparing the module for
   * use */
  function initializeQuiz() {
    set(_quiz, objectWithDefaults({}, Quiz));
    const newSection = addSection();
    setActiveSection(newSection.section_id);
    _fetchChannels();
  }

  /* @param  {Quiz} updates
   * @throws {TypeError} if updates is not a valid Quiz object
   * @affects _quiz
   * Validates the input type and then updates _quiz with the given updates */
  function updateQuiz(updates) {
    if (!validateQuiz(updates)) {
      throw new TypeError('updates must be a valid Quiz object');
    }
    set(_quiz, { ...get(_quiz), ...updates });
  }

  // --------------------------------
  // Questions / Exercises management
  // --------------------------------

  /* @param {QuizQuestion} question
   * @affects _selectedQuestions - Adds question to _selectedQuestions if it isn't there already */
  function addQuestionToSelection(question_id) {
    set(_selectedQuestions, uniq([...get(_selectedQuestions), question_id]));
  }

  /* @param {QuizQuestion} question
   * @affects _selectedQuestions - Removes question from _selectedQuestions if it is there */
  function removeQuestionFromSelection(question_id) {
    set(
      _selectedQuestions,
      get(_selectedQuestions).filter(id => id !== question_id)
    );
  }

  /* A list of all channels available which have exercises */
  const _channels = ref([]);

  /* @affects _channels - Fetches all channels with exercises and sets them to _channels */
  function _fetchChannels() {
    ChannelResource.fetchCollection({ params: { has_exercises: true, available: true } }).then(
      response => {
        set(
          _channels,
          response.map(chnl => {
            return {
              ...chnl,
              id: chnl.root,
              title: chnl.name,
              kind: ContentNodeKinds.CHANNEL,
              is_leaf: false,
            };
          })
        );
      }
    );
  }

  // Computed properties
  /* @returns {Quiz} The value of _quiz */
  const quiz = computed(() => get(_quiz));
  /* @returns {QuizSection[]} The value of _quiz's `question_sources` */
  const allSections = computed(() => get(quiz).question_sources);
  /* @returns {QuizSection} The active section */
  const activeSection = computed(() =>
    get(allSections).find(s => s.section_id === get(_activeSectionId))
  );
  /* @returns {Exercise[]} The active section's `exercise_pool` - that is, Exercises from which
   *                       we will enumerate all available questions */
  const activeExercisePool = computed(() => get(activeSection).exercise_pool);
  /* @returns {QuizQuestion[]} All questions in the active section's `questions` property,
   *                           those which are currently selected to be used in the section */
  const activeQuestions = computed(() => get(activeSection).questions);
  /* @returns {QuizQuestion[]} All questions the user has selected for the active section */
  const selectedActiveQuestions = computed(() => get(_selectedQuestions));
  /* @returns {QuizQuestion[]} Questions in the active section's `exercise_pool` that are not in
   *                           `questions` */
  const replacementQuestionPool = computed(() => {});
  /* @returns {Array} A list of all channels available which have exercises */
  const channels = computed(() => get(_channels));

  return {
    // Methods
    updateSection,
    replaceSelectedQuestions,
    addSection,
    removeSection,
    setActiveSection,
    initializeQuiz,
    updateQuiz,
    addQuestionToSelection,
    removeQuestionFromSelection,

    // Computed
    channels,
    quiz,
    allSections,
    activeSection,
    activeExercisePool,
    activeQuestions,
    selectedActiveQuestions,
    replacementQuestionPool,
  };
}
