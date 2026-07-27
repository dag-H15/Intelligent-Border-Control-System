import { Router } from "express";
import { authenticate, authorize } from "../middleware/authMiddleware";
import { createNewUser, getAllUsers, removeUser, resetPassword, unlockAccount, updateExistingUser } from "../controllers/userController";

const router = Router();

router.get("/", authenticate, authorize("ADMIN"), getAllUsers);
router.post("/", authenticate, authorize("ADMIN"), createNewUser);
router.put("/:id", authenticate, authorize("ADMIN"), updateExistingUser);
router.patch("/:id/password", authenticate, authorize("ADMIN"), resetPassword);
router.patch("/:id/unlock", authenticate, authorize("ADMIN"), unlockAccount);
router.delete("/:id", authenticate, authorize("ADMIN"), removeUser);

export default router;
