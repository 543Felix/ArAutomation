const express = require('express');
const validate = require('../../middlewares/validate');
const authMiddleware = require('../auth/auth.middleware');
const companyController = require('./company.controller');
const companyValidation = require('./company.validation');

const router = express.Router();

router.use(authMiddleware);

router.get('/', validate(companyValidation.listQuery), companyController.list);
router.post('/', validate(companyValidation.create), companyController.create);
router.get('/:id', validate(companyValidation.idParam), companyController.getOne);
router.patch('/:id', validate(companyValidation.update), companyController.update);
router.delete('/:id', validate(companyValidation.idParam), companyController.remove);

module.exports = router;
