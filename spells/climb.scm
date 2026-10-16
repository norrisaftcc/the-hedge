;; For a hedge of several floors. A hand on the hedge never climbs a stair,
;; so ask for up first, then keep the left hand. Each floor's stair is far
;; from where you arrive, and the gate is on the top floor.
(define (step)
  (if (open? up) (go up)
      (if (open? left) (begin (turn left) (go ahead))
          (if (open? ahead) (go ahead) (turn right)))))
(until (gate?) (step))
