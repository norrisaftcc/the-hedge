;; For a Sidewinder hedge. Every run of squares has one gate north, and the
;; north row is one long walk. seek finds this run's gate; climb goes up it.
;; Eight times, for eight rows. It ends at the north-west corner.
(define (climb)
  (until (wall? north) (go north)))
(define (seek)
  (until (or (open? north) (wall? east)) (go east))
  (until (or (open? north) (wall? west)) (go west)))
(repeat 8
  (seek)
  (climb))
(say "I am on the long walk.")
