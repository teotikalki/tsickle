goog.module('test_files.decorator.decorator');var module = module || {id: 'test_files/decorator/decorator.js'};/**
 * @fileoverview added by tsickle
 * @suppress {checkTypes} checked by tsc
 */
/**
 * @param {!Object} a
 * @param {string} b
 * @return {void}
 */
function decorator(a, b) { }
/**
 * \@Annotation
 * @param {!Object} a
 * @param {string} b
 * @return {void}
 */
function annotationDecorator(a, b) { }
/**
 * @param {?} t
 * @return {?}
 */
function classDecorator(t) { return t; }
/**
 * \@Annotation
 * @param {?} t
 * @return {?}
 */
function classAnnotation(t) { return t; }
class DecoratorTest {
}
DecoratorTest.decorators = [
    { type: classAnnotation },
];
/**
 * @nocollapse
 */
DecoratorTest.ctorParameters = () => [];
DecoratorTest.propDecorators = {
    'y': [{ type: annotationDecorator },],
};
__decorate([
    decorator,
    __metadata("design:type", Number)
], DecoratorTest.prototype, "x", void 0);
function DecoratorTest_tsickle_Closure_declarations() {
    /** @type {!Array<{type: !Function, args: (undefined|!Array<?>)}>} */
    DecoratorTest.decorators;
    /**
     * @nocollapse
     * @type {function(): !Array<(null|{type: ?, decorators: (undefined|!Array<{type: !Function, args: (undefined|!Array<?>)}>)})>}
     */
    DecoratorTest.ctorParameters;
    /** @type {!Object<string,!Array<{type: !Function, args: (undefined|!Array<?>)}>>} */
    DecoratorTest.propDecorators;
    /** @type {number} */
    DecoratorTest.prototype.x;
    /** @type {number} */
    DecoratorTest.prototype.y;
}
let DecoratedClass = class DecoratedClass {
};
DecoratedClass = __decorate([
    classDecorator
], DecoratedClass);
function DecoratedClass_tsickle_Closure_declarations() {
    /** @type {string} */
    DecoratedClass.prototype.z;
}
