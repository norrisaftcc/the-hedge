;; The spell grammar, in Scheme. chibi-scheme runs it to verify a spell:
;;
;;     chibi-scheme hedge/check.scm < spell.scm
;;
;; It reads every form on stdin, checks each against the language in
;; docs/LANGUAGE.md, and prints "ok" or "error: ...". Exit 0 or 1.
;; hedge/spell.py makes the same checks in Python; this is the second opinion.

(import (scheme base) (scheme read) (scheme write) (scheme process-context))

(define compass '(north east south west))
(define relative '(ahead back left right))
(define turns '(left right around))

(define (fail . parts)
  (display "error: ")
  (for-each display parts)
  (newline)
  (exit 1))

(define (show f)
  (let ((out (open-output-string)))
    (write f out)
    (get-output-string out)))

(define (name-of head) (symbol->string head))
(define (direction? x) (and (symbol? x) (or (memq x compass) (memq x relative)) #t))
(define (count? x) (and (exact-integer? x) (>= x 0)))

(define (check-body forms defined)
  (for-each (lambda (f) (check f defined #f)) forms))

(define (check f defined top)
  (cond
    ((boolean? f) #t)
    ((exact-integer? f) #t)
    ((string? f) #t)
    ((symbol? f) (fail f " is not a thing on its own; did you mean (" f ")?"))
    ((null? f) (fail "() is empty"))
    ((not (list? f)) (fail (show f) " is not a form"))
    ((not (symbol? (car f))) (fail (show f) " does not start with a name"))
    (else
     (let* ((head (car f)) (args (cdr f)) (n (length args)))
       (define (need ok msg) (if (not ok) (fail (show f) ": " msg)))
       (case head
         ((go) (need (and (= n 1) (direction? (car args)))
                     "go needs one direction: north south east west ahead back left right"))
         ((face) (need (and (= n 1) (symbol? (car args)) (memq (car args) compass))
                       "face needs north, south, east or west"))
         ((turn) (need (and (= n 1) (symbol? (car args)) (memq (car args) turns))
                       "turn needs left, right or around"))
         ((wall? open?) (need (and (= n 1) (direction? (car args)))
                              (string-append (name-of head) " needs one direction")))
         ((gate? dead-end? stop mark) (need (= n 0) (string-append (name-of head) " takes nothing")))
         ((marked?) (need (or (= n 0) (and (= n 1) (direction? (car args)))) "marked? takes nothing, or one direction"))
         ((until while) (need (>= n 2) (string-append (name-of head) " needs a test and a body"))
                        (check-body args defined))
         ((repeat) (need (and (>= n 2) (count? (car args))) "repeat needs a count and a body")
                   (check-body (cdr args) defined))
         ((if) (need (or (= n 2) (= n 3)) "if needs a test, a then, and maybe an else")
               (check-body args defined))
         ((when unless) (need (>= n 2) (string-append (name-of head) " needs a test and a body"))
                        (check-body args defined))
         ((and or begin) (check-body args defined))
         ((not) (need (= n 1) "not needs one thing") (check (car args) defined #f))
         ((say) (need (and (= n 1) (string? (car args))) "say needs \"words in quotes\""))
         ((define) (need top "define only at the top of a spell")
                   (check-body (cdr args) defined))
         (else
          (if (memq head defined)
              (need (= n 0) (string-append "(" (name-of head) ") takes nothing"))
              (fail head " is not a word of the language"))))))))

(define (read-all)
  (let loop ((acc '()))
    (let ((f (guard (e (#t (fail "does not read: "
                                 (if (error-object? e) (error-object-message e) "bad syntax"))))
               (read))))
      (if (eof-object? f) (reverse acc) (loop (cons f acc))))))

(define (define-form? f)
  (and (pair? f) (eq? (car f) 'define)))

(define (defined-names forms)
  (let loop ((fs forms) (acc '()))
    (cond
      ((null? fs) acc)
      ((define-form? (car fs))
       (let ((f (car fs)))
         (if (not (and (list? f) (>= (length f) 3) (list? (cadr f)) (= (length (cadr f)) 1) (symbol? (car (cadr f)))))
             (fail "define needs (define (name) body...)"))
         (loop (cdr fs) (cons (car (cadr f)) acc))))
      (else (loop (cdr fs) acc)))))

(define forms (read-all))
(if (null? forms) (fail "an empty spell"))
(define defined (defined-names forms))
(for-each (lambda (f) (check f defined #t)) forms)
(display "ok")
(newline)
